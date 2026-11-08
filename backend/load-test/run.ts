/**
 * Live-dispatch load test — SERVICE level, against a real Postgres.
 *
 *   LIVE_DISPATCH_TEST_DATABASE_URL=postgres://… npm run load:live
 *
 * Uses the fake routing provider and the recording push sender BY DEFAULT —
 * a load test must never cost money or wake real drivers. (Set
 * LOAD_ROUTING_LATENCY_MS to simulate a slow provider.)
 *
 * What it measures and what it does NOT: it drives the application service
 * and repositories exactly as the HTTP controllers do, minus HTTP/JSON/TLS and
 * Nest's guard/throttler overhead. Those layers add a roughly constant cost
 * per request; the database contention — the thing that decides whether 400
 * drivers fit on one VPS — is measured for real. An HTTP-level run (k6 or
 * autocannon against staging) is listed as an open item in the report.
 *
 * "Registered" ≠ "online": the scenarios create REGISTERED drivers and then
 * make only a stated fraction of them online.
 */
import { cpus, totalmem } from 'node:os'
import { PlainSqlCandidateFinder } from '../src/live-dispatch/dispatching/candidate-finder'
import { LiveDispatchService } from '../src/live-dispatch/live-dispatch.service'
import { RecordingPushSender } from '../src/live-dispatch/notify/fcm'
import { InProcessBus } from '../src/live-dispatch/notify/realtime-bus'
import { NearbyLiveService, PlainSqlLiveQuery } from '../src/live-dispatch/public/nearby-live.service'
import { FakeRoutingProvider } from '../src/live-dispatch/routing/providers'
import { GuardedRouting } from '../src/live-dispatch/routing/routing-provider'
import { createRuntime, type LiveDispatchRuntime } from '../src/live-dispatch/runtime'
import { createTestDatabase, insertAdminUser, insertSiteDriver, type TestDatabase } from '../src/live-dispatch/test-support/test-db'
import { TEST_CONFIG } from '../test-live/support'

const REGISTERED = Number(process.env.LOAD_REGISTERED ?? 400)
const ONLINE_FRACTION = Number(process.env.LOAD_ONLINE_FRACTION ?? 1)
const DURATION_S = Number(process.env.LOAD_DURATION_S ?? 60)
const ROUTING_LATENCY_MS = Number(process.env.LOAD_ROUTING_LATENCY_MS ?? 0)

const YEREVAN = { latitude: 40.1772, longitude: 44.5126 }

interface Stats {
  name: string
  ok: number
  errors: Record<string, number>
  latencies: number[]
}

function stats(name: string): Stats {
  return { name, ok: 0, errors: {}, latencies: [] }
}

async function timed<T>(s: Stats, fn: () => Promise<T>): Promise<T | undefined> {
  const started = performance.now()
  try {
    const result = await fn()
    s.ok++
    return result
  } catch (error) {
    const key = (error as { code?: string }).code ?? (error as Error).message.slice(0, 60)
    s.errors[key] = (s.errors[key] ?? 0) + 1
    return undefined
  } finally {
    s.latencies.push(performance.now() - started)
  }
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]
}

function report(s: Stats, seconds: number): string {
  const total = s.ok + Object.values(s.errors).reduce((a, b) => a + b, 0)
  return [
    s.name.padEnd(34),
    `n=${String(total).padStart(6)}`,
    `rps=${(total / seconds).toFixed(1).padStart(6)}`,
    `p50=${pct(s.latencies, 50).toFixed(1).padStart(6)}ms`,
    `p95=${pct(s.latencies, 95).toFixed(1).padStart(6)}ms`,
    `p99=${pct(s.latencies, 99).toFixed(1).padStart(6)}ms`,
    `max=${Math.max(0, ...s.latencies).toFixed(1).padStart(7)}ms`,
    `errors=${JSON.stringify(s.errors)}`,
  ].join('  ')
}

function jitterPoint(i: number) {
  // Spread across greater Yerevan and nearby marzes (±~25 km)
  const angle = (i * 137.508 * Math.PI) / 180
  const r = 0.02 + ((i * 7919) % 1000) / 1000 * 0.22
  return { latitude: YEREVAN.latitude + r * Math.sin(angle), longitude: YEREVAN.longitude + r * Math.cos(angle) * 1.3 }
}

async function setupDrivers(db: TestDatabase, rt: LiveDispatchRuntime) {
  const drivers: { driverId: number; sessionId: string; seq: number; point: { latitude: number; longitude: number }; online: boolean }[] = []
  const settings = await rt.settings.get()
  for (let i = 0; i < REGISTERED; i++) {
    const { driverId } = await insertSiteDriver(db.pool, { wheelSkates: i % 3 === 0 })
    const online = i < REGISTERED * ONLINE_FRACTION
    const { session } = await rt.fleet.createSession({ driverId, deviceId: `load-${i}-device`, platform: i % 2 ? 'ios' : 'android', appVersion: 'load' })
    await rt.fleet.recordTrackingConsent(driverId, 1)
    if (online) {
      await rt.fleet.setAvailability(driverId, session.id, { wantsOnline: true })
      await rt.fleet.heartbeat(driverId, session.id)
    }
    await rt.fleet.registerPushToken(session.id, driverId, `load-token-${driverId}`.padEnd(40, 'x'))
    const point = jitterPoint(i)
    await rt.fleet.ingestLocations(driverId, session.id, [{ seq: 1, ...point, accuracyM: 12, measuredAt: new Date().toISOString() }], settings)
    drivers.push({ driverId, sessionId: session.id, seq: 1, point, online })
  }
  return drivers
}

async function main() {
  const db = await createTestDatabase()
  const push = new RecordingPushSender()
  const routing = new FakeRoutingProvider({ latencyMs: ROUTING_LATENCY_MS })
  const rt = createRuntime(db.pool, { ...TEST_CONFIG, routingTimeoutMs: Math.max(4000, ROUTING_LATENCY_MS * 3) }, {
    routingProvider: routing,
    finder: new PlainSqlCandidateFinder(),
    pushSender: push,
    bus: new InProcessBus(),
  })
  const service = new LiveDispatchService(rt)
  const adminId = await insertAdminUser(db.pool)
  const [{ server_version: pgVersion }] = await db.pool.query<{ server_version: string }>(`SHOW server_version`)

  console.log(`environment: node ${process.version}, ${cpus().length}× ${cpus()[0]?.model ?? 'cpu'}, ${(totalmem() / 2 ** 30).toFixed(1)} GiB RAM, PostgreSQL ${pgVersion} (local, no PostGIS → plain-SQL distance), pool=40`)
  console.log(`scenario: ${REGISTERED} registered drivers, ${Math.round(REGISTERED * ONLINE_FRACTION)} online, ${DURATION_S}s, routing latency ${ROUTING_LATENCY_MS} ms (fake provider), push=recording`)

  const setupStarted = performance.now()
  const drivers = await setupDrivers(db, rt)
  console.log(`setup: ${drivers.length} drivers in ${((performance.now() - setupStarted) / 1000).toFixed(1)}s`)

  const location = stats('location ingest (1 fix)')
  const heartbeat = stats('heartbeat')
  const snapshot = stats('driver snapshot')
  const createAndStart = stats('order create + start')
  const accept = stats('offer accept')
  const nearby = stats('public live nearby')
  const advance = stats('dispatch step (worker)')
  const settings = await rt.settings.get()
  const processor = rt.createProcessor()
  const nearbyService = new NearbyLiveService(
    db.pool,
    new PlainSqlLiveQuery(),
    new GuardedRouting(routing, db.pool, { timeoutMs: 4000, retries: 0, baseBackoffMs: 50, maxConcurrent: 2, dailyElementBudget: () => 1e9, budgetKey: 'fake:public', rejectWhenBusy: true }),
    () => rt.settings.get(),
    async (ids) => ids.map((id) => ({ id })),
    async () => ({ results: [] }),
    { enabled: true, cacheTtlMs: 60_000, cacheMax: 500 },
  )

  let running = true
  const until = Date.now() + DURATION_S * 1000
  const loops: Promise<void>[] = []

  // 1. Every online driver: a fix every ~30 s (±10 s jitter) and a heartbeat every ~45 s.
  for (const driver of drivers.filter((d) => d.online)) {
    loops.push(
      (async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 30_000))
        let lastHeartbeat = Date.now()
        while (running && Date.now() < until) {
          driver.seq++
          driver.point = { latitude: driver.point.latitude + (Math.random() - 0.5) * 0.002, longitude: driver.point.longitude + (Math.random() - 0.5) * 0.002 }
          await timed(location, () =>
            rt.fleet.ingestLocations(driver.driverId, driver.sessionId, [{ seq: driver.seq, ...driver.point, accuracyM: 10, measuredAt: new Date().toISOString() }], settings),
          )
          if (Date.now() - lastHeartbeat > 45_000) {
            lastHeartbeat = Date.now()
            await timed(heartbeat, () => rt.fleet.heartbeat(driver.driverId, driver.sessionId))
          }
          await new Promise((r) => setTimeout(r, 20_000 + Math.random() * 20_000))
        }
      })(),
    )
  }

  // 2. The worker loop, as in production.
  loops.push(
    (async () => {
      while (running && Date.now() < until + 5000) {
        const t = performance.now()
        const n = await processor.tick()
        if (n > 0) advance.latencies.push(performance.now() - t), (advance.ok += n)
        else await new Promise((r) => setTimeout(r, 200))
      }
    })(),
  )
  loops.push(
    (async () => {
      while (running && Date.now() < until) {
        await rt.reconciler.run(settings)
        await new Promise((r) => setTimeout(r, 3000))
      }
    })(),
  )

  // 3. Concurrent orders: one new order every 2 s, each accepted by whoever is offered (mixed free/busy fleet).
  let ordersCreated = 0
  loops.push(
    (async () => {
      while (running && Date.now() < until) {
        const pickup = jitterPoint(Math.floor(Math.random() * 1000))
        const body = {
          customerPhone: '+37491000001',
          pickup: { ...pickup, address: 'Load test pickup' },
          vehicle: { weightKg: 1500 },
          requirements: { wheelsRoll: true, steeringLocked: false, gearboxLocked: false, needsManipulator: false },
          pricing: { mode: 'FIXED', quotedPriceAmd: 15000 },
        }
        await timed(createAndStart, async () => {
          const created = await service.createOrder(adminId, body, { idempotencyKey: `load-create-${ordersCreated}-${Date.now()}`, method: 'POST', route: '/load', body })
          const order = created.body as { id: number; version: number }
          const started = await service.startDispatch(adminId, order.id, order.version, { idempotencyKey: `load-start-${order.id}`, method: 'POST', route: '/load', body: {} })
          if (started.status !== 200) throw Object.assign(new Error('start failed'), { code: (started.body as { code: string }).code })
        })
        ordersCreated++
        await new Promise((r) => setTimeout(r, 2000))
      }
    })(),
  )
  // Drivers answer offers they see: 70 % accept, 20 % reject, 10 % let it time out.
  loops.push(
    (async () => {
      while (running && Date.now() < until) {
        const pending = await db.pool.query<{ id: string; driverId: number }>(`SELECT "id"::text, "driverId" FROM "OrderOffer" WHERE "status" = 'PENDING'`)
        for (const offer of pending) {
          const roll = Math.random()
          if (roll < 0.7) {
            await timed(accept, async () => {
              const r = await service.driverAccept(offer.driverId, offer.id, { idempotencyKey: `load-accept-${offer.id}`, method: 'POST', route: '/load', body: {} })
              if (r.status !== 200) throw Object.assign(new Error('refused'), { code: (r.body as { code: string }).code })
            })
          } else if (roll < 0.9) {
            await service.driverReject(offer.driverId, offer.id, null, { idempotencyKey: `load-reject-${offer.id}`, method: 'POST', route: '/load', body: {} })
          }
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    })(),
  )

  // 4. Public nearby searches: 5 concurrent visitors, one search every ~1 s each, at random points.
  for (let v = 0; v < 5; v++) {
    loops.push(
      (async () => {
        while (running && Date.now() < until) {
          const p = jitterPoint(Math.floor(Math.random() * 5000))
          await timed(nearby, () => nearbyService.search(p.latitude, p.longitude, Math.random() < 0.3))
          await new Promise((r) => setTimeout(r, 800 + Math.random() * 400))
        }
      })(),
    )
  }

  // 5. Snapshots: open apps re-reading state now and then.
  loops.push(
    (async () => {
      while (running && Date.now() < until) {
        const d = drivers[Math.floor(Math.random() * drivers.length)]
        await timed(snapshot, () => service.driverSnapshot(d.driverId))
        await new Promise((r) => setTimeout(r, 100))
      }
    })(),
  )

  // 6. Halfway: a reconnect burst — every online driver re-reads the snapshot and heartbeats at once.
  const burst = stats('reconnect burst (snapshot+hb)')
  setTimeout(async () => {
    const t = performance.now()
    await Promise.all(drivers.filter((d) => d.online).map((d) => timed(burst, async () => {
      await rt.fleet.heartbeat(d.driverId, d.sessionId)
      await service.driverSnapshot(d.driverId)
    })))
    console.log(`reconnect burst: ${burst.ok} drivers in ${(performance.now() - t).toFixed(0)} ms`)
  }, (DURATION_S * 1000) / 2)

  // 7. Two-thirds in: worker restart — stop the processor mid-flight, start a fresh one.
  setTimeout(async () => {
    await processor.stop()
    const fresh = rt.createProcessor()
    fresh.start()
    console.log('worker restarted (processor stopped and replaced)')
    setTimeout(() => void fresh.stop(), (DURATION_S * 1000) / 3 + 3000)
  }, (DURATION_S * 2000) / 3)

  await Promise.all(loops)
  running = false

  // Invariants after the storm
  const [{ doubleOrder }] = await db.pool.query<{ doubleOrder: number }>(
    `SELECT count(*)::int AS "doubleOrder" FROM (SELECT "orderId" FROM "OrderAssignment" WHERE "endedAt" IS NULL GROUP BY "orderId" HAVING count(*) > 1) x`,
  )
  const [{ doubleDriver }] = await db.pool.query<{ doubleDriver: number }>(
    `SELECT count(*)::int AS "doubleDriver" FROM (SELECT "driverId" FROM "OrderAssignment" WHERE "endedAt" IS NULL GROUP BY "driverId" HAVING count(*) > 1) x`,
  )
  const [{ overdue }] = await db.pool.query<{ overdue: number }>(
    `SELECT count(*)::int AS overdue FROM "OrderOffer" WHERE "status" = 'PENDING' AND "expiresAt" < now() - interval '10 seconds'`,
  )
  const byStatus = await db.pool.query<{ status: string; n: number }>(`SELECT "status"::text, count(*)::int AS n FROM "DispatchOrder" GROUP BY 1 ORDER BY 1`)
  const [{ backlog }] = await db.pool.query<{ backlog: number }>(`SELECT count(*)::int AS backlog FROM "OutboxEvent" WHERE "processedAt" IS NULL AND "availableAt" <= now()`)

  console.log('\n— results —')
  for (const s of [location, heartbeat, snapshot, createAndStart, accept, nearby, burst]) console.log(report(s, DURATION_S))
  console.log(`worker: ${advance.ok} outbox messages, tick p95 ${pct(advance.latencies, 95).toFixed(1)} ms`)
  console.log(`orders created: ${ordersCreated}; by status: ${byStatus.map((r) => `${r.status}=${r.n}`).join(' ')}`)
  console.log(`pushes recorded (not sent): ${push.sent.length}; routing calls: ${routing.calls}`)
  console.log(`INVARIANTS: orders with >1 active assignment = ${doubleOrder}; drivers with >1 active assignment = ${doubleDriver}; offers overdue >10 s and still PENDING = ${overdue}; outbox due backlog = ${backlog}`)
  const memory = process.memoryUsage()
  console.log(`process: rss ${(memory.rss / 2 ** 20).toFixed(0)} MiB, heap ${(memory.heapUsed / 2 ** 20).toFixed(0)} MiB`)

  await db.drop()
  if (doubleOrder > 0 || doubleDriver > 0) process.exit(2)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
