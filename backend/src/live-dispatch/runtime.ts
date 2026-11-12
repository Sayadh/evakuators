/**
 * The composition root: builds every live-dispatch component from a config
 * object. Used by the NestJS module (API process), by `worker.ts` (worker
 * process) and by the integration tests — so all three run the SAME wiring.
 *
 * Processes: the API serves HTTP + WebSocket and never runs the outbox loop;
 * the worker runs the outbox loop and the reconciler and serves nothing.
 * Both can run on one VPS or on separate machines without code changes:
 * the only things they share are Postgres (truth) and Redis (fan-out).
 */
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { PostgisCandidateFinder, type CandidateFinder } from './dispatching/candidate-finder'
import { DispatchEngine, silentLogger, type EngineLogger } from './dispatching/engine'
import { OffersRepository } from './dispatching/offers.repository'
import { Reconciler } from './dispatching/reconciler'
import { FleetAccess, type PasswordHasher } from './fleet/fleet-access'
import { FleetRepository } from './fleet/fleet.repository'
import { OrdersRepository } from './orders/orders.repository'
import { FcmSender, RecordingPushSender, type PushSender, type ServiceAccount } from './notify/fcm'
import { OutboxProcessor, type OutboxHandler } from './notify/outbox-processor'
import { PushService } from './notify/push.service'
import { InProcessBus, RedisBus, type RealtimeBus } from './notify/realtime-bus'
import { parseRedisUrl } from './notify/redis-resp'
import { SettingsRepository } from './platform/settings.repository'
import type { SqlDatabase } from './platform/sql'
import { createRoutingProvider, FakeRoutingProvider } from './routing/providers'
import { GuardedRouting, type RoutingProvider } from './routing/routing-provider'
import { ROUTE_ORS_DISPATCH_DAILY_SHARE } from '../routing/routing.constants'

export interface LiveDispatchConfig {
  enabled: boolean
  trackingEnabled: boolean
  liveNearbyEnabled: boolean
  routingProvider: 'google' | 'ors' | 'fake'
  googleRoutesApiKey: string
  googleRoutingPreference: 'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL'
  orsApiKey: string
  routingTimeoutMs: number
  routingRetries: number
  routingMaxConcurrent: number
  /** Provider requests per day for dispatch; null = no request cap (see GuardOptions.dailyRequestBudget) */
  routingDailyRequests: number | null
  pushProvider: 'fcm' | 'recording'
  fcmServiceAccount: ServiceAccount | null
  /**
   * iOS Critical Alerts for the offer ring (rings through silent mode and Do
   * Not Disturb). Needs Apple's approval of the critical-alerts entitlement
   * AND an app built with it (mobile app.config.ts IOS_CRITICAL_ALERTS).
   * Harmless otherwise: an app not entitled gets an ordinary sound.
   */
  apnsCriticalAlerts: boolean
  redisUrl: string
}

export function readLiveDispatchConfig(env: NodeJS.ProcessEnv): LiveDispatchConfig {
  const flag = (name: string) => (env[name] ?? '').toLowerCase() === 'true'
  let fcmServiceAccount: ServiceAccount | null = null
  // The key as one line of JSON, or (2026-11-12) the path of the file Firebase
  // downloads — «Generate new private key» — so nobody has to flatten it by hand.
  const accountJson = env.FCM_SERVICE_ACCOUNT_JSON
    ? env.FCM_SERVICE_ACCOUNT_JSON
    : env.FCM_SERVICE_ACCOUNT_FILE
      ? readFileSync(resolvePath(env.FCM_SERVICE_ACCOUNT_FILE), 'utf8')
      : null
  if (accountJson) {
    const parsed = JSON.parse(accountJson) as ServiceAccount
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error('FCM service account is incomplete')
    fcmServiceAccount = parsed
  }
  const pushProvider = (env.PUSH_PROVIDER ?? 'recording') as LiveDispatchConfig['pushProvider']
  if (pushProvider === 'fcm' && !fcmServiceAccount) throw new Error('PUSH_PROVIDER=fcm requires FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_FILE')
  return {
    enabled: flag('LIVE_DISPATCH_ENABLED'),
    trackingEnabled: flag('DRIVER_TRACKING_ENABLED'),
    liveNearbyEnabled: flag('LIVE_NEARBY_ENABLED'),
    // The safe defaults: no paid routing and no real pushes unless asked for.
    routingProvider: (env.DISPATCH_ROUTING_PROVIDER ?? 'fake') as LiveDispatchConfig['routingProvider'],
    googleRoutesApiKey: env.GOOGLE_ROUTES_API_KEY ?? '',
    googleRoutingPreference: (env.GOOGLE_ROUTING_PREFERENCE ?? 'TRAFFIC_AWARE') as LiveDispatchConfig['googleRoutingPreference'],
    orsApiKey: env.ROUTE_MATRIX_API_KEY ?? '',
    routingTimeoutMs: Number(env.DISPATCH_ROUTING_TIMEOUT_MS ?? 4000),
    routingRetries: Number(env.DISPATCH_ROUTING_RETRIES ?? 1),
    routingMaxConcurrent: Number(env.DISPATCH_ROUTING_MAX_CONCURRENT ?? 4),
    // ORS bills per request and its key is shared with the website: dispatch
    // keeps to its share unless the env says otherwise.
    routingDailyRequests: env.DISPATCH_ROUTING_DAILY_REQUESTS
      ? Number(env.DISPATCH_ROUTING_DAILY_REQUESTS)
      : (env.DISPATCH_ROUTING_PROVIDER ?? 'fake') === 'ors'
        ? ROUTE_ORS_DISPATCH_DAILY_SHARE
        : null,
    pushProvider,
    fcmServiceAccount,
    apnsCriticalAlerts: flag('APNS_CRITICAL_ALERTS'),
    redisUrl: env.REDIS_URL ?? '',
  }
}

/** The worker never hashes passwords; the API process passes bcrypt (nest/runtime.provider.ts). */
const unconfiguredHasher: PasswordHasher = {
  dummyHash: '',
  hash: async () => {
    throw new Error('password hashing is not configured in this process')
  },
  compare: async () => {
    throw new Error('password hashing is not configured in this process')
  },
}

export interface LiveDispatchRuntime {
  db: SqlDatabase
  config: LiveDispatchConfig
  settings: SettingsRepository
  fleet: FleetRepository
  /** Who may use the app (grant, register, approve, suspend, login) */
  access: FleetAccess
  orders: OrdersRepository
  offers: OffersRepository
  routing: GuardedRouting
  /** The raw provider, for a second guard with its own budget (public search) */
  routingProvider: RoutingProvider
  engine: DispatchEngine
  reconciler: Reconciler
  push: PushService
  pushSender: PushSender
  bus: RealtimeBus
  createProcessor(): OutboxProcessor
}

export function createRuntime(
  db: SqlDatabase,
  config: LiveDispatchConfig,
  overrides: {
    routingProvider?: RoutingProvider
    finder?: CandidateFinder
    pushSender?: PushSender
    bus?: RealtimeBus
    logger?: EngineLogger
    passwordHasher?: PasswordHasher
  } = {},
): LiveDispatchRuntime {
  const settings = new SettingsRepository(db)
  const fleet = new FleetRepository(db)
  const access = new FleetAccess(db, overrides.passwordHasher ?? unconfiguredHasher)
  const orders = new OrdersRepository(db)
  const offers = new OffersRepository(db)
  const provider =
    overrides.routingProvider ??
    (config.routingProvider === 'fake'
      ? new FakeRoutingProvider()
      : createRoutingProvider({
          provider: config.routingProvider,
          googleApiKey: config.googleRoutesApiKey,
          googleRoutingPreference: config.googleRoutingPreference,
          orsApiKey: config.orsApiKey,
        }))
  let budget = 20_000
  const routing = new GuardedRouting(provider, db, {
    timeoutMs: config.routingTimeoutMs,
    retries: config.routingRetries,
    baseBackoffMs: 250,
    maxConcurrent: config.routingMaxConcurrent,
    dailyElementBudget: () => budget,
    dailyRequestBudget: config.routingDailyRequests === null ? undefined : () => config.routingDailyRequests as number,
  })
  const loadSettings = async () => {
    const value = await settings.get()
    budget = value.routingDailyElementBudget
    return value
  }
  const engine = new DispatchEngine(db, offers, overrides.finder ?? new PostgisCandidateFinder(), routing, loadSettings, overrides.logger ?? silentLogger)
  const reconciler = new Reconciler(db, offers)
  const pushSender =
    overrides.pushSender ?? (config.pushProvider === 'fcm' && config.fcmServiceAccount ? new FcmSender(config.fcmServiceAccount) : new RecordingPushSender())
  const push = new PushService(db, pushSender, undefined, { criticalAlerts: config.apnsCriticalAlerts })
  const bus = overrides.bus ?? (config.redisUrl ? new RedisBus(parseRedisUrl(config.redisUrl)) : new InProcessBus())

  const handlers: Record<string, OutboxHandler> = {
    'dispatch.advance': async (message) => {
      await engine.advance(Number(message.payload.orderId))
      return 'done'
    },
    'offer.expire': async (message) => {
      await offers.expire(String(message.payload.offerId))
      return 'done'
    },
    'push.offer': async (message) =>
      (await push.sendOfferPush(String(message.payload.offerId), Number(message.payload.ring ?? 1) || 1)) === 'retry' ? 'retry' : 'done',
    'push.offerClosed': async (message) => ((await push.sendOfferClosedPush(String(message.payload.offerId))) === 'retry' ? 'retry' : 'done'),
    'push.walletCredited': async (message) =>
      (await push.sendWalletCreditedPush(Number(message.payload.driverId), Number(message.payload.amountAmd), Number(message.payload.balanceAmd))) === 'retry'
        ? 'retry'
        : 'done',
    'push.walletLow': async (message) =>
      (await push.sendWalletLowPush(Number(message.payload.driverId), Number(message.payload.balanceAmd))) === 'retry' ? 'retry' : 'done',
    'push.order': async (message) =>
      (await push.sendOrderPush(Number(message.payload.orderId), Number(message.payload.driverId), String(message.payload.kind))) === 'retry'
        ? 'retry'
        : 'done',
    realtime: async (message) => {
      await bus.publish({
        eventId: message.id,
        audiences: message.payload.audiences as string[],
        event: String(message.payload.event),
        data: message.payload.data as Record<string, unknown>,
        at: new Date().toISOString(),
      })
      return 'done'
    },
  }

  return {
    db,
    config,
    settings,
    fleet,
    access,
    orders,
    offers,
    routing,
    routingProvider: provider,
    engine,
    reconciler,
    push,
    pushSender,
    bus,
    createProcessor: () => new OutboxProcessor(db, handlers),
  }
}
