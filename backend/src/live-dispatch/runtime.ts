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
import { PostgisCandidateFinder, type CandidateFinder } from './dispatching/candidate-finder'
import { DispatchEngine, silentLogger, type EngineLogger } from './dispatching/engine'
import { OffersRepository } from './dispatching/offers.repository'
import { Reconciler } from './dispatching/reconciler'
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
  pushProvider: 'fcm' | 'recording'
  fcmServiceAccount: ServiceAccount | null
  redisUrl: string
}

export function readLiveDispatchConfig(env: NodeJS.ProcessEnv): LiveDispatchConfig {
  const flag = (name: string) => (env[name] ?? '').toLowerCase() === 'true'
  let fcmServiceAccount: ServiceAccount | null = null
  if (env.FCM_SERVICE_ACCOUNT_JSON) {
    const parsed = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error('FCM_SERVICE_ACCOUNT_JSON is incomplete')
    fcmServiceAccount = parsed
  }
  const pushProvider = (env.PUSH_PROVIDER ?? 'recording') as LiveDispatchConfig['pushProvider']
  if (pushProvider === 'fcm' && !fcmServiceAccount) throw new Error('PUSH_PROVIDER=fcm requires FCM_SERVICE_ACCOUNT_JSON')
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
    pushProvider,
    fcmServiceAccount,
    redisUrl: env.REDIS_URL ?? '',
  }
}

export interface LiveDispatchRuntime {
  db: SqlDatabase
  config: LiveDispatchConfig
  settings: SettingsRepository
  fleet: FleetRepository
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
  } = {},
): LiveDispatchRuntime {
  const settings = new SettingsRepository(db)
  const fleet = new FleetRepository(db)
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
  const push = new PushService(db, pushSender)
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
    'push.offer': async (message) => ((await push.sendOfferPush(String(message.payload.offerId))) === 'retry' ? 'retry' : 'done'),
    'push.order': async (message) =>
      (await push.sendOrderPush(Number(message.payload.orderId), Number(message.payload.towTruckId), String(message.payload.kind))) === 'retry'
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
