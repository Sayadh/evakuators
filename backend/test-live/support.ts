/**
 * A full live-dispatch runtime over a real test database, with the safe
 * adapters: plain-SQL candidate finder (no PostGIS needed), fake routing,
 * recording push sender, in-process realtime bus.
 */
import { randomUUID } from 'node:crypto'
import { PlainSqlCandidateFinder } from '../src/live-dispatch/dispatching/candidate-finder'
import { LiveDispatchService, type MutationContext } from '../src/live-dispatch/live-dispatch.service'
import { RecordingPushSender } from '../src/live-dispatch/notify/fcm'
import { InProcessBus, type RealtimeEvent } from '../src/live-dispatch/notify/realtime-bus'
import { DEFAULT_DISPATCH_SETTINGS, type DispatchSettings } from '../src/live-dispatch/platform/settings'
import { FakeRoutingProvider } from '../src/live-dispatch/routing/providers'
import type { RoutingProvider } from '../src/live-dispatch/routing/routing-provider'
import { createRuntime, type LiveDispatchConfig, type LiveDispatchRuntime } from '../src/live-dispatch/runtime'
import { insertAdminUser, insertAppOnlyDriver, insertSiteDriver, type TestDatabase } from '../src/live-dispatch/test-support/test-db'
import { isoSecondsAgo, offset, YEREVAN } from './helpers'

export const TEST_CONFIG: LiveDispatchConfig = {
  enabled: true,
  trackingEnabled: true,
  liveNearbyEnabled: true,
  routingProvider: 'fake',
  googleRoutesApiKey: '',
  googleRoutingPreference: 'TRAFFIC_AWARE',
  orsApiKey: '',
  routingTimeoutMs: 2000,
  routingRetries: 1,
  routingMaxConcurrent: 4,
  routingDailyRequests: null,
  pushProvider: 'recording',
  fcmServiceAccount: null,
  apnsCriticalAlerts: false,
  redisUrl: '',
}

export interface Harness {
  db: TestDatabase
  rt: LiveDispatchRuntime
  service: LiveDispatchService
  push: RecordingPushSender
  events: RealtimeEvent[]
  adminId: number
  setSettings(overrides: Partial<DispatchSettings>): Promise<void>
}

export async function harness(db: TestDatabase, routing: RoutingProvider = new FakeRoutingProvider()): Promise<Harness> {
  const push = new RecordingPushSender()
  const bus = new InProcessBus()
  const events: RealtimeEvent[] = []
  bus.subscribe((e) => events.push(e))
  const rt = createRuntime(db.pool, TEST_CONFIG, { routingProvider: routing, finder: new PlainSqlCandidateFinder(), pushSender: push, bus })
  const adminId = await insertAdminUser(db.pool)
  return {
    db,
    rt,
    service: new LiveDispatchService(rt),
    push,
    events,
    adminId,
    async setSettings(overrides) {
      await db.pool.query(`DELETE FROM "DispatchSetting"`)
      const merged = { ...DEFAULT_DISPATCH_SETTINGS, ...overrides }
      for (const [key, value] of Object.entries(overrides)) {
        await db.pool.query(`INSERT INTO "DispatchSetting" ("key", "value") VALUES ($1, $2::jsonb)`, [key, JSON.stringify(value)])
      }
      void merged
      ;(rt.settings as unknown as { cache: null }).cache = null
    },
  }
}

export function ctx(body: unknown = {}, key: string = randomUUID(), route = '/test'): MutationContext {
  return { idempotencyKey: key, method: 'POST', route, body }
}

let seq = 1

/** A driver who is approved, consented, online, alive and has a fresh fix at `point` */
export async function eligibleDriver(
  h: Harness,
  point: { latitude: number; longitude: number },
  truck: Parameters<typeof insertSiteDriver>[1] = {},
): Promise<{ driverId: number; towTruckId: number; sessionId: string }> {
  const { driverId, towTruckId } = await insertSiteDriver(h.db.pool, truck)
  const { session } = await h.rt.fleet.createSession({ driverId, deviceId: `dev-${driverId}`, platform: 'android', appVersion: '1.0.0' })
  await h.rt.fleet.recordTrackingConsent(driverId, 1)
  await h.rt.fleet.setAvailability(driverId, session.id, { wantsOnline: true })
  await h.rt.fleet.heartbeat(driverId, session.id)
  await h.rt.fleet.registerPushToken(session.id, driverId, `token-${driverId}-`.padEnd(40, 'x'))
  await h.rt.fleet.ingestLocations(driverId, session.id, [{ seq: seq++, ...point, accuracyM: 10, measuredAt: isoSecondsAgo(1) }], await h.rt.settings.get())
  return { driverId, towTruckId, sessionId: session.id }
}

/** Same as eligibleDriver for an APP-ONLY driver (no website card) */
export async function eligibleAppOnlyDriver(
  h: Harness,
  point: { latitude: number; longitude: number },
  truck: Parameters<typeof insertAppOnlyDriver>[1] = {},
): Promise<{ driverId: number; sessionId: string }> {
  const driverId = await insertAppOnlyDriver(h.db.pool, truck)
  const { session } = await h.rt.fleet.createSession({ driverId, deviceId: `dev-app-${driverId}`, platform: 'ios', appVersion: '1.0.0' })
  await h.rt.fleet.recordTrackingConsent(driverId, 1)
  await h.rt.fleet.setAvailability(driverId, session.id, { wantsOnline: true })
  await h.rt.fleet.heartbeat(driverId, session.id)
  await h.rt.fleet.ingestLocations(driverId, session.id, [{ seq: seq++, ...point, accuracyM: 10, measuredAt: isoSecondsAgo(1) }], await h.rt.settings.get())
  return { driverId, sessionId: session.id }
}

export const ORDER_BODY = {
  customerPhone: '+37491000001',
  customerName: 'Test Customer',
  pickup: { ...YEREVAN, address: 'Հանրապետության հրապարակ' },
  destination: { ...offset(YEREVAN, 5000, 3000), address: 'Arabkir garage' },
  vehicle: { make: 'Toyota', model: 'Camry', plate: '01AA001', weightKg: 1600 },
  problemDescription: 'Engine does not start',
  requirements: { wheelsRoll: true, steeringLocked: false, gearboxLocked: false, needsManipulator: false },
  pricing: { mode: 'FIXED', quotedPriceAmd: 15000 },
}

export async function createOrder(h: Harness, overrides: Record<string, unknown> = {}): Promise<{ id: number; version: number }> {
  const response = await h.service.createOrder(h.adminId, { ...ORDER_BODY, ...overrides }, ctx({ ...ORDER_BODY, ...overrides }))
  if (response.status !== 201) throw new Error(`create failed: ${JSON.stringify(response.body)}`)
  const body = response.body as { id: number; version: number }
  return { id: body.id, version: body.version }
}

export async function startDispatch(h: Harness, order: { id: number; version: number }) {
  const response = await h.service.startDispatch(h.adminId, order.id, order.version, ctx({ v: order.version }))
  if (response.status !== 200) throw new Error(`start failed: ${JSON.stringify(response.body)}`)
  return response.body as { version: number; status: string }
}

/** Drains the outbox like the worker would, until quiet */
export async function drain(h: Harness, rounds = 20): Promise<void> {
  const processor = h.rt.createProcessor()
  for (let i = 0; i < rounds; i++) {
    const taken = await processor.tick()
    if (taken === 0) return
  }
}

export async function pendingOffer(h: Harness, orderId: number) {
  const rows = await h.db.pool.query<{ id: string; driverId: number }>(
    `SELECT "id"::text AS "id", "driverId" FROM "OrderOffer" WHERE "orderId" = $1::int AND "status" = 'PENDING'`,
    [orderId],
  )
  return rows[0] ?? null
}

export async function orderRow(h: Harness, orderId: number) {
  const [row] = await h.db.pool.query<Record<string, unknown>>(`SELECT * FROM "DispatchOrder" WHERE "id" = $1::int`, [orderId])
  return row
}

/** Moves an offer's deadline into the past without waiting */
export async function overdue(h: Harness, offerId: string): Promise<void> {
  await h.db.pool.query(
    `UPDATE "OrderOffer" SET "createdAt" = now() - interval '60 seconds', "expiresAt" = now() - interval '1 second' WHERE "id" = $1::uuid`,
    [offerId],
  )
}

export async function count(h: Harness, sql: string, params: unknown[] = []): Promise<number> {
  const [row] = await h.db.pool.query<{ n: number }>(sql, params as never)
  return Number(row.n)
}
