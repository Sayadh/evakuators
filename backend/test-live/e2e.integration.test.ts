/**
 * End-to-end flows through the application service, the outbox worker loop
 * and the engine, on a real Postgres. Routing and push are the fake/recording
 * adapters (no cost, no real drivers notified).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FakeRoutingProvider } from '../src/live-dispatch/routing/providers'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { count, createOrder, ctx, drain, eligibleDriver, harness, orderRow, overdue, pendingOffer, startDispatch, type Harness } from './support'

describe('E2E flows (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh(routing?: FakeRoutingProvider) {
    // Each flow gets a clean slate of drivers/orders in the shared database.
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting", "RoutingUsageDay" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get(), routing)
  }

  it('create → dispatch → accept → en route → arrived → transport → complete; payment untouched', async () => {
    await fresh()
    const near = await eligibleDriver(h, offset(YEREVAN, 800, 0))
    await eligibleDriver(h, offset(YEREVAN, 6000, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)

    const offer = await pendingOffer(h, order.id)
    assert.ok(offer, 'an offer was made')
    assert.equal(offer.driverId, near.driverId, 'nearest by road ETA first')

    // The snapshot shows the offer with a server-based countdown and NO customer contact
    const snapshot = await h.service.driverSnapshot(near.driverId)
    assert.ok(snapshot.currentOffer)
    const offerJson = JSON.stringify(snapshot.currentOffer)
    assert.ok(!offerJson.includes('+37491000001'), 'customer phone hidden before acceptance')
    assert.ok(!offerJson.includes('Test Customer'), 'customer name hidden before acceptance')

    const accepted = await h.service.driverAccept(near.driverId, offer.id, ctx())
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
    assert.deepEqual(accepted.body, { orderId: order.id, status: 'ASSIGNED' })

    const after = await h.service.driverSnapshot(near.driverId)
    assert.equal(after.activeOrder?.customer.phone, '+37491000001', 'contact revealed after acceptance')
    assert.deepEqual(after.activeOrder?.allowedActions, ['EN_ROUTE', 'ARRIVED'])

    for (const action of ['EN_ROUTE', 'ARRIVED', 'START_TRANSPORT', 'COMPLETE'] as const) {
      const r = await h.service.driverProgress(near.driverId, order.id, action, ctx({ action }))
      assert.equal(r.status, 200, `${action}: ${JSON.stringify(r.body)}`)
    }
    const row = await orderRow(h, order.id)
    assert.equal(row.status, 'COMPLETED')
    assert.equal(row.paymentStatus, 'UNKNOWN', 'completing never marks paid')
    assert.equal(row.activeAssignmentId, null)
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderAssignment" WHERE "orderId" = $1::int AND "endedAt" IS NULL`, [order.id]), 0)

    // the driver is free again
    const done = await h.service.driverSnapshot(near.driverId)
    assert.equal(done.activeOrder, null)

    // audit trail has the whole story, in order
    const types = (await h.rt.orders.timeline(order.id)).map((e) => e.type)
    for (const expected of ['ORDER_CREATED', 'DISPATCH_STARTED', 'CANDIDATES_ADDED', 'OFFER_CREATED', 'OFFER_ACCEPTED', 'PROGRESS_EN_ROUTE', 'PROGRESS_ARRIVED', 'PROGRESS_START_TRANSPORT', 'PROGRESS_COMPLETE']) {
      assert.ok(types.includes(expected), `timeline has ${expected}: ${types.join(',')}`)
    }
    // push went out with the offer deadline as TTL and no PII on the lock screen
    const pushed = h.push.sent.find((m) => m.data.type === 'offer')
    assert.ok(pushed)
    assert.ok(pushed.ttlSeconds > 0 && pushed.ttlSeconds <= 30)
    assert.ok(!`${pushed.title} ${pushed.body}`.includes('Հանրապետության'), 'no address on the lock screen')
  })

  it('reject → next driver immediately; timeout → next driver', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const b = await eligibleDriver(h, offset(YEREVAN, 1500, 0))
    const c = await eligibleDriver(h, offset(YEREVAN, 2500, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)

    const first = await pendingOffer(h, order.id)
    assert.equal(first?.driverId, a.driverId)
    const rejected = await h.service.driverReject(a.driverId, first!.id, 'too far', ctx())
    assert.equal(rejected.status, 200)
    await drain(h)

    const second = await pendingOffer(h, order.id)
    assert.equal(second?.driverId, b.driverId, 'next candidate after rejection')
    await overdue(h, second!.id)
    await h.rt.reconciler.run(await h.rt.settings.get())
    await drain(h)

    const third = await pendingOffer(h, order.id)
    assert.equal(third?.driverId, c.driverId, 'next candidate after timeout')
    // never the same driver twice in one attempt
    assert.equal(await count(h, `SELECT count(DISTINCT "driverId")::int AS n FROM "OrderOffer" WHERE "orderId" = $1::int`, [order.id]), 3)
  })

  it('no candidates at all → NEEDS_ATTENTION (search exhausted), alert raised', async () => {
    await fresh()
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const row = await orderRow(h, order.id)
    assert.equal(row.status, 'NEEDS_ATTENTION')
    assert.equal(row.attentionKind, 'SEARCH_EXHAUSTED')
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderAlert" WHERE "orderId" = $1::int AND "kind" = 'SEARCH_FAILED'`, [order.id]), 1)
    // and it can be restarted by an operator later
    const restarted = await h.service.startDispatch(h.adminId, order.id, Number(row.version), ctx({ restart: 1 }))
    assert.equal(restarted.status, 200, JSON.stringify(restarted.body))
  })

  it('the radius widens stage by stage before giving up', async () => {
    await fresh()
    await h.setSettings({ yerevanRadiiMeters: [2000, 30000] })
    const far = await eligibleDriver(h, offset(YEREVAN, 15000, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    assert.equal((await pendingOffer(h, order.id))?.driverId, far.driverId)
    const [{ searchStage }] = await h.db.pool.query<{ searchStage: number }>(`SELECT "searchStage" FROM "DispatchAttempt" WHERE "orderId" = $1::int`, [order.id])
    assert.equal(searchStage, 1)
  })

  it('negotiated price: accept → PRICE_CONFIRMATION_PENDING; may drive, may not transport until confirmed', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 700, 0))
    const order = await createOrder(h, { pricing: { mode: 'NEGOTIATION_REQUIRED' } })
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    const snap = await h.service.driverSnapshot(d.driverId)
    assert.equal((snap.currentOffer as { order: { price: { mode: string; confirmed: boolean } } }).order.price.mode, 'NEGOTIATION_REQUIRED')
    assert.equal((snap.currentOffer as { order: { price: { confirmed: boolean } } }).order.price.confirmed, false)

    const accepted = await h.service.driverAccept(d.driverId, offer!.id, ctx())
    assert.deepEqual(accepted.body, { orderId: order.id, status: 'PRICE_CONFIRMATION_PENDING' })
    assert.equal((await h.service.driverProgress(d.driverId, order.id, 'EN_ROUTE', ctx({ a: 1 }))).status, 200)
    assert.equal((await h.service.driverProgress(d.driverId, order.id, 'ARRIVED', ctx({ a: 2 }))).status, 200)
    const blocked = await h.service.driverProgress(d.driverId, order.id, 'START_TRANSPORT', ctx({ a: 3 }))
    assert.equal(blocked.status, 409)
    assert.equal((blocked.body as { code: string }).code, 'PRICE_NOT_CONFIRMED')

    const row = await orderRow(h, order.id)
    const confirmed = await h.service.confirmPrice(h.adminId, order.id, 18000, Number(row.version), ctx({ p: 18000 }))
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body))
    assert.equal((await h.service.driverProgress(d.driverId, order.id, 'START_TRANSPORT', ctx({ a: 4 }))).status, 200)
    const events = await h.rt.orders.timeline(order.id)
    const priceEvent = events.find((e) => e.type === 'PRICE_CONFIRMED')
    assert.deepEqual(priceEvent?.data, { agreedPriceAmd: 18000, quotedPriceAmd: null })
  })

  it('manual reassignment: driver asks out → stays assigned → operator releases + restarts in one step → another driver', async () => {
    await fresh()
    const first = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const second = await eligibleDriver(h, offset(YEREVAN, 3000, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, first.driverId)
    await h.service.driverAccept(first.driverId, offer!.id, ctx())

    const request = await h.service.driverRequest(first.driverId, order.id, { kind: 'CANCEL', reason: 'TECHNICAL_PROBLEM', comment: 'flat tyre' }, ctx({ r: 1 }))
    assert.equal(request.status, 201, JSON.stringify(request.body))
    let row = await orderRow(h, order.id)
    assert.equal(row.status, 'NEEDS_ATTENTION')
    assert.ok(row.activeAssignmentId, 'assignment KEPT — no automatic second truck')
    await drain(h)
    assert.equal(await pendingOffer(h, order.id), null, 'nothing re-dispatched automatically')

    const released = await h.service.releaseAssignment(
      h.adminId,
      order.id,
      { confirm: true, reason: 'driver has a flat tyre', restartSearch: true, expectedVersion: Number(row.version) },
      ctx({ release: 1 }),
    )
    assert.equal(released.status, 200, JSON.stringify(released.body))
    await drain(h)
    const next = await pendingOffer(h, order.id)
    assert.equal(next?.driverId, second.driverId, 'released driver is not re-offered the same job')
    row = await orderRow(h, order.id)
    assert.equal(row.status, 'SEARCHING')
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderDriverRequest" WHERE "orderId" = $1::int AND "status" = 'OPEN'`, [order.id]), 0)
  })

  it('manual offer: hard constraints never overridable; soft ones need an audited reason', async () => {
    await fresh()
    const busy = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const stale = await eligibleDriver(h, offset(YEREVAN, 900, 0))
    await h.db.pool.query(`UPDATE "DriverLocationCurrent" SET "measuredAt" = now() - interval '10 minutes' WHERE "driverId" = $1::int`, [stale.driverId])

    // busy: give `busy` an active order first
    const other = await createOrder(h)
    await startDispatch(h, other)
    await drain(h)
    const o1 = await pendingOffer(h, other.id)
    assert.equal(o1?.driverId, busy.driverId)
    await h.service.driverAccept(busy.driverId, o1!.id, ctx())

    const order = await createOrder(h)
    const busyTry = await h.service.manualOffer(h.adminId, order.id, { driverId: busy.driverId, overrideReason: 'please', expectedVersion: order.version }, ctx({ a: 1 }))
    assert.equal((busyTry.body as { code: string }).code, 'DRIVER_BUSY')
    const staleNoReason = await h.service.manualOffer(h.adminId, order.id, { driverId: stale.driverId, expectedVersion: order.version }, ctx({ a: 2 }))
    assert.equal((staleNoReason.body as { code: string }).code, 'DRIVER_UNAVAILABLE')
    const staleWithReason = await h.service.manualOffer(
      h.adminId,
      order.id,
      { driverId: stale.driverId, overrideReason: 'spoke on the phone, he is at the depot', expectedVersion: order.version },
      ctx({ a: 3 }),
    )
    assert.equal(staleWithReason.status, 201, JSON.stringify(staleWithReason.body))
    const event = (await h.rt.orders.timeline(order.id)).find((e) => e.type === 'MANUAL_OFFER')
    assert.deepEqual((event?.data as { overriddenReasons: string[] }).overriddenReasons, ['GPS_STALE'])

    // manual offer expiring goes back to a person, not to auto-dispatch
    const offer = await pendingOffer(h, order.id)
    await overdue(h, offer!.id)
    await h.rt.reconciler.run(await h.rt.settings.get())
    const row = await orderRow(h, order.id)
    assert.equal(row.status, 'NEEDS_ATTENTION')
    assert.equal(row.attentionKind, 'MANUAL_OFFER_FAILED')
  })

  it('requirements: unknown blocks dispatch; capability filters candidates', async () => {
    await fresh()
    const plain = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const skates = await eligibleDriver(h, offset(YEREVAN, 2000, 0), { wheelSkates: true })
    const unknown = await createOrder(h, { requirements: { wheelsRoll: null } })
    const refused = await h.service.startDispatch(h.adminId, unknown.id, unknown.version, ctx({ u: 1 }))
    assert.equal((refused.body as { code: string }).code, 'REQUIREMENTS_UNCONFIRMED')

    const locked = await createOrder(h, { requirements: { wheelsRoll: false, steeringLocked: false, gearboxLocked: true, needsManipulator: false } })
    await startDispatch(h, locked)
    await drain(h)
    const offer = await pendingOffer(h, locked.id)
    assert.equal(offer?.driverId, skates.driverId, 'nearest truck without wheel skates was not offered')
    assert.notEqual(offer?.driverId, plain.driverId)
  })
})
