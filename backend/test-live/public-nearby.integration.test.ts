import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeNearby, NearbyLiveService, PlainSqlLiveQuery, type FallbackSearchResult } from '../src/live-dispatch/public/nearby-live.service'
import { FakeRoutingProvider } from '../src/live-dispatch/routing/providers'
import { GuardedRouting } from '../src/live-dispatch/routing/routing-provider'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { count, createOrder, ctx, drain, eligibleAppOnlyDriver, eligibleDriver, harness, pendingOffer, startDispatch } from './support'

describe('public live nearby search (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()

  async function setup(enabled = true, fallback: FallbackSearchResult = { results: [], routed: false }) {
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "RoutingUsageDay" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    const h = await harness(dbCtx.get())
    const routing = new GuardedRouting(new FakeRoutingProvider(), dbCtx.get().pool, {
      timeoutMs: 1000,
      retries: 0,
      baseBackoffMs: 1,
      maxConcurrent: 2,
      dailyElementBudget: () => 1000,
      budgetKey: 'fake:public',
    })
    const fallbackCalls: unknown[] = []
    const service = new NearbyLiveService(
      dbCtx.get().pool,
      new PlainSqlLiveQuery(),
      routing,
      () => h.rt.settings.get(),
      // the real code passes TowTrucksService.getCardsByIds — the public card
      async (ids) => ids.map((id) => ({ id, slug: `t-${id}`, driverName: 'Public Name' })),
      async (lat, lng, skip) => {
        fallbackCalls.push({ lat, lng, skip })
        return fallback
      },
      { enabled, cacheTtlMs: 60_000, cacheMax: 10 },
    )
    return { h, service, fallbackCalls }
  }

  it('returns live drivers by road ETA with rounded figures and NO coordinates anywhere in the payload', async () => {
    const { h, service } = await setup()
    const nearPoint = offset(YEREVAN, 1234, 0)
    const near = await eligibleDriver(h, nearPoint)
    await eligibleDriver(h, offset(YEREVAN, 7000, 0))
    await eligibleDriver(h, offset(YEREVAN, 900, 0), { vehicleType: 'heavy-duty', capacityTons: 20 })
    const result = await service.search(YEREVAN.latitude, YEREVAN.longitude, false)
    assert.equal(result.liveCount, 2)
    assert.equal(result.results[0].towTruck.id, near.towTruckId, 'the PUBLIC card id (TowTruck), never the app driver id')
    assert.equal(result.results.length, 2, 'the specialist heavy-duty truck is not general discovery')
    for (const item of result.results) {
      assert.ok(item.live)
      assert.equal(item.roadMeters! % 100, 0)
      assert.equal(item.durationSeconds! % 60, 0)
    }
    const json = JSON.stringify(result)
    for (const coordinate of [nearPoint.latitude.toFixed(4), nearPoint.longitude.toFixed(4)]) {
      assert.ok(!json.includes(coordinate), `exact coordinate ${coordinate} leaked`)
    }
    assert.ok(!/latitude|longitude/.test(json), 'no coordinate fields at all')
    assert.equal(result.disclaimer, 'NOT_A_RESERVATION')
  })

  it('the search has no side effects: no order, no offer, no reservation, no notification', async () => {
    const { h, service } = await setup()
    await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const before = await Promise.all([
      count(h, `SELECT count(*)::int AS n FROM "DispatchOrder"`),
      count(h, `SELECT count(*)::int AS n FROM "OrderOffer"`),
      count(h, `SELECT count(*)::int AS n FROM "OutboxEvent"`),
      count(h, `SELECT count(*)::int AS n FROM "OrderEvent"`),
    ])
    h.push.sent.length = 0
    await service.search(YEREVAN.latitude, YEREVAN.longitude, false)
    const after = await Promise.all([
      count(h, `SELECT count(*)::int AS n FROM "DispatchOrder"`),
      count(h, `SELECT count(*)::int AS n FROM "OrderOffer"`),
      count(h, `SELECT count(*)::int AS n FROM "OutboxEvent"`),
      count(h, `SELECT count(*)::int AS n FROM "OrderEvent"`),
    ])
    assert.deepEqual(after, before)
    assert.equal(h.push.sent.length, 0)
  })

  it('no fresh GPS → the driver is measured from the profile parking spot instead (existing search)', async () => {
    const stale = { towTruck: { id: -1 }, straightLineMeters: 3000, roadMeters: 3500, durationSeconds: 400 }
    const { h, service, fallbackCalls } = await setup(true, { results: [stale], routed: true })
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    stale.towTruck.id = d.towTruckId
    await h.db.pool.query(`UPDATE "DriverLocationCurrent" SET "measuredAt" = now() - interval '10 minutes' WHERE "driverId" = $1::int`, [d.driverId])
    const result = await service.search(40.5, 44.7, false)
    assert.equal(result.liveCount, 0)
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0].live, undefined, 'a stale phone position is never presented as live')
    assert.equal(result.results[0].straightLineMeters, 3000)
    assert.equal(fallbackCalls.length, 1)
  })

  it('ONE list: a live driver replaces their own profile entry and is ranked among everyone by time', async () => {
    const profileOnlyFar = { towTruck: { id: 900001 }, straightLineMeters: 9000, roadMeters: 11000, durationSeconds: 900 }
    const profileOnlyNear = { towTruck: { id: 900002 }, straightLineMeters: 2500, roadMeters: 3000, durationSeconds: 120 }
    const liveDriversProfile = { towTruck: { id: -1 }, straightLineMeters: 15000, roadMeters: 18000, durationSeconds: 1500 }
    const { h, service } = await setup(true, { results: [profileOnlyNear, profileOnlyFar, liveDriversProfile], routed: true })
    const d = await eligibleDriver(h, offset(YEREVAN, 1000, 0))
    liveDriversProfile.towTruck.id = d.towTruckId
    const result = await service.search(YEREVAN.latitude, YEREVAN.longitude, false)
    const ids = result.results.map((r) => r.towTruck.id)
    assert.equal(ids.filter((id) => id === d.towTruckId).length, 1, 'never listed twice')
    const live = result.results.find((r) => r.towTruck.id === d.towTruckId)!
    assert.ok(live.live, 'measured from where the driver is NOW, not their parking spot 15 km away')
    assert.ok(live.straightLineMeters < 2000)
    // ranked by time among everyone: fake routing gives the live driver a few minutes
    const times = result.results.map((r) => r.durationSeconds!)
    assert.deepEqual(times, [...times].sort((a, b) => a - b))
    assert.equal(result.liveCount, 1)
    assert.equal(result.routed, true)
  })

  it('an APP-ONLY driver (not on the website) never appears in the public search', async () => {
    const { h, service } = await setup()
    await eligibleAppOnlyDriver(h, offset(YEREVAN, 300, 0))
    const site = await eligibleDriver(h, offset(YEREVAN, 2000, 0))
    const result = await service.search(YEREVAN.latitude, YEREVAN.longitude, false)
    assert.deepEqual(result.results.map((r) => r.towTruck.id), [site.towTruckId])
  })

  it('a website driver whose app access was SUSPENDED is not shown as live', async () => {
    const { h, service } = await setup()
    const d = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    await h.db.pool.query(`UPDATE "FleetDriver" SET "status" = 'SUSPENDED' WHERE "id" = $1::int`, [d.driverId])
    const result = await service.search(YEREVAN.latitude, YEREVAN.longitude, false)
    assert.equal(result.liveCount, 0)
  })

  it('mergeNearby: routed first by time, then straight line; live wins a tie; limit applies', () => {
    const merged = mergeNearby(
      [{ towTruck: { id: 1 }, straightLineMeters: 1000, live: { freshness: 'UNDER_1_MIN' } }],
      [
        { towTruck: { id: 2 }, straightLineMeters: 5000, roadMeters: 6000, durationSeconds: 600 },
        { towTruck: { id: 3 }, straightLineMeters: 1000 },
        { towTruck: { id: 1 }, straightLineMeters: 9000, roadMeters: 9900, durationSeconds: 999 },
      ],
      10,
    )
    assert.deepEqual(merged.map((m) => m.towTruck.id), [2, 1, 3])
    assert.equal(mergeNearby([], [{ towTruck: { id: 5 }, straightLineMeters: 1 }, { towTruck: { id: 6 }, straightLineMeters: 2 }], 1).length, 1)
  })

  it('#14 a stale public result does not bind dispatch: the driver became busy → not offered', async () => {
    const { h, service } = await setup()
    const seen = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const result = await service.search(YEREVAN.latitude, YEREVAN.longitude, false)
    assert.equal(result.results[0].towTruck.id, seen.towTruckId)
    // the driver takes an external job before the operator creates the order
    await h.rt.fleet.setAvailability(seen.driverId, seen.sessionId, { externalBusy: true })
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    assert.equal(await pendingOffer(h, order.id), null)
    void ctx
  })

  it('skipRouting gives a straight-line-only list with no times; the public budget is separate from dispatch', async () => {
    const { h, service } = await setup()
    await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const result = await service.search(40.181, 44.52, true)
    assert.equal(result.routed, false)
    assert.equal(result.results[0].durationSeconds, undefined)
    assert.equal(result.results[0].roadMeters, undefined)
    await service.search(40.19, 44.53, false)
    const [{ n }] = await h.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM "RoutingUsageDay" WHERE "provider" = 'fake:public'`)
    assert.equal(n, 1)
  })

  it('disabled flag → FEATURE_DISABLED (the website keeps using the existing search)', async () => {
    const { service } = await setup(false)
    await assert.rejects(service.search(YEREVAN.latitude, YEREVAN.longitude, false), (e: { code: string }) => e.code === 'FEATURE_DISABLED')
  })

  it('validates input: outside Armenia and non-finite values are refused', async () => {
    const { service } = await setup()
    await assert.rejects(service.search(48.85, 2.35, false), (e: { code: string }) => e.code === 'VALIDATION_FAILED')
    await assert.rejects(service.search(Number.NaN, 44, false), (e: { code: string }) => e.code === 'VALIDATION_FAILED')
  })
})
