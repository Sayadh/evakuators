import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NearbyLiveService, PlainSqlLiveQuery } from '../src/live-dispatch/public/nearby-live.service'
import { FakeRoutingProvider } from '../src/live-dispatch/routing/providers'
import { GuardedRouting } from '../src/live-dispatch/routing/routing-provider'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { count, createOrder, ctx, drain, eligibleDriver, harness, pendingOffer, startDispatch } from './support'

describe('public live nearby search (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()

  async function setup(enabled = true) {
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
        return { results: [], routed: false }
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
    assert.equal(result.live.reason, 'OK')
    assert.equal(result.live.items[0].towTruck.id, near.towTruckId)
    assert.equal(result.live.items.length, 2, 'the specialist heavy-duty truck is not general discovery')
    for (const item of result.live.items) {
      assert.equal(item.roadMeters! % 100, 0)
      assert.equal(item.etaSeconds! % 60, 0)
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

  it('no fresh GPS → says so explicitly and still returns the fallback section', async () => {
    const { h, service, fallbackCalls } = await setup()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await h.db.pool.query(`UPDATE "DriverLocationCurrent" SET "measuredAt" = now() - interval '10 minutes' WHERE "towTruckId" = $1::int`, [d.towTruckId])
    const result = await service.search(40.5, 44.7, false)
    assert.equal(result.live.reason, 'NO_LIVE_DRIVERS')
    assert.equal(result.live.items.length, 0)
    assert.equal(fallbackCalls.length, 1)
  })

  it('#14 a stale public result does not bind dispatch: the driver became busy → not offered', async () => {
    const { h, service } = await setup()
    const seen = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const result = await service.search(YEREVAN.latitude, YEREVAN.longitude, false)
    assert.equal(result.live.items[0].towTruck.id, seen.towTruckId)
    // the driver takes an external job before the operator creates the order
    await h.rt.fleet.setAvailability(seen.towTruckId, seen.sessionId, { externalBusy: true })
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
    assert.equal(result.live.routed, false)
    assert.equal(result.live.items[0].etaSeconds, null)
    assert.equal(result.live.items[0].roadMeters, null)
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
