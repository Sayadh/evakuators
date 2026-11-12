/**
 * End-to-end flows through the application service, the outbox worker loop
 * and the engine, on a real Postgres. Routing and push are the fake/recording
 * adapters (no cost, no real drivers notified).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FakeRoutingProvider } from '../src/live-dispatch/routing/providers'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { count, createOrder, ctx, drain, eligibleDriver, harness, ORDER_BODY, orderRow, overdue, pendingOffer, startDispatch, type Harness } from './support'

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
    // push went out with the offer deadline as TTL; it says where from and
    // where to (product decision 2026-11) but never the customer's contact
    const pushed = h.push.sent.find((m) => m.data.type === 'offer')
    assert.ok(pushed)
    // TTL = the offer deadline, never longer than the offer timeout setting (45 s by default)
    assert.ok(pushed.ttlSeconds > 0 && pushed.ttlSeconds <= (await h.rt.settings.get()).offerTimeoutSeconds)
    assert.ok(pushed.body.includes('Հանրապետության հրապարակ → Arabkir garage'), pushed.body)
    assert.ok(!`${pushed.title} ${pushed.body}`.includes('+37491000001') && !`${pushed.title} ${pushed.body}`.includes('Test Customer'), 'no customer contact')
    assert.equal(pushed.actionCategory, 'offer', 'actionable: Accept / Reject buttons')
    assert.equal(pushed.sound, 'offer_alert.wav', 'no ring chosen → the original')
  })

  it('the offer push rings with the sound the driver chose on that phone', async () => {
    await fresh()
    const driver = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    // The app re-registers its token with the chosen ring (POST me/push-token `sound`)
    await h.rt.fleet.registerPushToken(driver.sessionId, driver.driverId, `token-${driver.driverId}-`.padEnd(40, 'x'), 'harp')
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, driver.driverId)
    const pushed = h.push.sent.find((m) => m.data.type === 'offer' && m.data.offerId === offer!.id)
    assert.equal(pushed?.sound, 'offer_harp.wav')
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

  it('missed offers: the driver sees the offer he let run out, why, and that another driver took it — never who, never the customer', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const b = await eligibleDriver(h, offset(YEREVAN, 1500, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const first = await pendingOffer(h, order.id)
    assert.equal(first?.driverId, a.driverId)
    // It rang on his phone (delivered) but he did not answer in time
    // (created a minute ago: a delivery cannot precede the offer — OrderOffer_deliveredAt_check)
    await h.db.pool.query(
      `UPDATE "OrderOffer" SET "createdAt" = now() - interval '60 seconds', "deliveredAt" = now() - interval '50 seconds' WHERE "id" = $1::uuid`,
      [first!.id],
    )
    await overdue(h, first!.id)
    await h.rt.reconciler.run(await h.rt.settings.get())
    await drain(h)
    const second = await pendingOffer(h, order.id)
    assert.equal(second?.driverId, b.driverId)
    // A rejection is a choice, not a missed offer
    assert.deepEqual(await h.service.driverMissedOffers(b.driverId, 20, null), [])
    const accepted = await h.service.driverAccept(b.driverId, second!.id, ctx({ take: 1 }))
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))

    const missed = await h.service.driverMissedOffers(a.driverId, 20, null)
    assert.equal(missed.length, 1)
    assert.equal(missed[0].offerId, first!.id)
    assert.equal(missed[0].reason, 'NO_ANSWER')
    assert.equal(missed[0].outcome, 'TAKEN')
    const text = JSON.stringify(missed)
    assert.ok(!text.includes(ORDER_BODY.customerPhone) && !text.includes(ORDER_BODY.customerName) && !/customer/i.test(text), 'no customer contact')
    assert.doesNotMatch(text, /"driverId"|"driverName"/, 'never who took it')
    // paging: nothing before the only item
    assert.deepEqual(await h.service.driverMissedOffers(a.driverId, 20, new Date(missed[0].offeredAt)), [])
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

  it('GPS switched off and the phone silent: still offered by his base while push can ring him', async () => {
    await fresh()
    const near = offset(YEREVAN, 600, 0)
    // GPS off → no fixes AND no background heartbeat (it rides on location updates)
    async function silentWithBase(minutesAgo: number, withPushToken: boolean) {
      const d = await eligibleDriver(h, near)
      await h.db.pool.query(`UPDATE "TowTruck" SET "latitude" = $2, "longitude" = $3 WHERE "id" = $1::int`, [d.towTruckId, near.latitude, near.longitude])
      await h.db.pool.query(
        `UPDATE "DriverLocationCurrent" SET "measuredAt" = now() - make_interval(mins => $2::int) WHERE "driverId" = $1::int`,
        [d.driverId, minutesAgo],
      )
      await h.db.pool.query(`UPDATE "DriverPresence" SET "lastHeartbeatAt" = now() - make_interval(mins => $2::int) WHERE "driverId" = $1::int`, [d.driverId, minutesAgo])
      if (!withPushToken) await h.db.pool.query(`UPDATE "PushDeviceToken" SET "invalidatedAt" = now() WHERE "driverId" = $1::int`, [d.driverId])
      return d
    }
    const unreachable = await silentWithBase(5, false)
    const tooLong = await silentWithBase(45, true)
    const reachable = await silentWithBase(5, true)
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, reachable.driverId, 'base fallback with a stale heartbeat but a live push token')
    assert.notEqual(offer?.driverId, unreachable.driverId)
    assert.notEqual(offer?.driverId, tooLong.driverId)
    const [{ locationSource }] = await h.db.pool.query<{ locationSource: string }>(
      `SELECT "locationSource" FROM "DispatchCandidate" WHERE "driverId" = $1::int`,
      [reachable.driverId],
    )
    assert.equal(locationSource, 'BASE')
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

  it('negotiated price: accept → PRICE_CONFIRMATION_PENDING; no setting off (nor transport) until the price is recorded', async () => {
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
    // 2026-11-12: the agreed price comes first — no «Շարժվում եմ» / «Տեղում եմ» without it
    for (const [step, key] of [['EN_ROUTE', 1], ['ARRIVED', 2]] as const) {
      const blocked = await h.service.driverProgress(d.driverId, order.id, step, ctx({ a: key }))
      assert.equal(blocked.status, 409)
      assert.equal((blocked.body as { code: string }).code, 'PRICE_NOT_CONFIRMED')
    }

    const row = await orderRow(h, order.id)
    const confirmed = await h.service.confirmPrice(h.adminId, order.id, 18000, Number(row.version), ctx({ p: 18000 }))
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body))
    assert.equal((await h.service.driverProgress(d.driverId, order.id, 'EN_ROUTE', ctx({ a: 3 }))).status, 200)
    assert.equal((await h.service.driverProgress(d.driverId, order.id, 'ARRIVED', ctx({ a: 4 }))).status, 200)
    assert.equal((await h.service.driverProgress(d.driverId, order.id, 'START_TRANSPORT', ctx({ a: 5 }))).status, 200)
    const events = await h.rt.orders.timeline(order.id)
    const priceEvent = events.find((e) => e.type === 'PRICE_CONFIRMED')
    assert.deepEqual(priceEvent?.data, { agreedPriceAmd: 18000, quotedPriceAmd: null })
  })

  it('driver cancels with a reason (not "customer declined") → released and re-dispatched at once to another driver', async () => {
    await fresh()
    const first = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const second = await eligibleDriver(h, offset(YEREVAN, 3000, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, first.driverId)
    await h.service.driverAccept(first.driverId, offer!.id, ctx())

    // NOT_SPECIFIED = what the app sends when no reason was picked in 45 s
    const request = await h.service.driverRequest(first.driverId, order.id, { kind: 'CANCEL', reason: 'NOT_SPECIFIED' }, ctx({ r: 1 }))
    assert.equal(request.status, 201, JSON.stringify(request.body))
    assert.deepEqual(request.body, { released: true, orderId: order.id }, 'the driver no longer sees the order')
    const row = await orderRow(h, order.id)
    assert.equal(row.status, 'SEARCHING')
    assert.equal(row.activeAssignmentId, null, 'the cancelling driver is released')
    await drain(h)
    const next = await pendingOffer(h, order.id)
    assert.equal(next?.driverId, second.driverId, 'the driver who cancelled is not offered the same job again')
    assert.equal((await h.service.driverSnapshot(first.driverId)).activeOrder, null)
  })

  it('manual reassignment: customer declined → stays assigned → operator releases + restarts in one step → another driver', async () => {
    await fresh()
    const first = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const second = await eligibleDriver(h, offset(YEREVAN, 3000, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, first.driverId)
    await h.service.driverAccept(first.driverId, offer!.id, ctx())

    // "Customer declined" may mean the whole order is off: a person decides.
    const request = await h.service.driverRequest(first.driverId, order.id, { kind: 'CANCEL', reason: 'CUSTOMER_DECLINED', comment: 'customer found another truck' }, ctx({ r: 1 }))
    assert.equal(request.status, 201, JSON.stringify(request.body))
    let row = await orderRow(h, order.id)
    assert.equal(row.status, 'NEEDS_ATTENTION')
    assert.ok(row.activeAssignmentId, 'assignment KEPT — no automatic second truck')
    await drain(h)
    assert.equal(await pendingOffer(h, order.id), null, 'nothing re-dispatched automatically')

    const released = await h.service.releaseAssignment(
      h.adminId,
      order.id,
      { confirm: true, reason: 'customer still needs a truck', restartSearch: true, expectedVersion: Number(row.version) },
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

  it('a destination may be a description only: kept, shown to the driver, no route invented', async () => {
    await fresh()
    const driver = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const order = await createOrder(h, { destination: { latitude: null, longitude: null, address: 'Davtashen' } })
    const detail = await h.service.orderDetail(order.id)
    assert.deepEqual((detail as { order: { destination: unknown } }).order.destination, { latitude: null, longitude: null, address: 'Davtashen' })
    assert.deepEqual(await h.service.computeOrderRoute(h.adminId, order.id), { computed: false, reason: 'NO_DESTINATION' })
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, driver.driverId)
    const snap = await h.service.driverSnapshot(driver.driverId)
    assert.equal((snap.currentOffer?.order as { destination?: { address?: string } } | undefined)?.destination?.address, 'Davtashen')
    // half a pair is still refused
    await assert.rejects(
      h.service.createOrder(h.adminId, { ...ORDER_BODY, destination: { latitude: 40.2, longitude: null, address: 'x y' } }, ctx({ bad: 1 })),
      (e: { code?: string }) => e.code === 'VALIDATION_FAILED',
    )
  })

  it('requirements: unknown ones do not block dispatch (optional since 2026-11); capability filters candidates', async () => {
    await fresh()
    const plain = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const skates = await eligibleDriver(h, offset(YEREVAN, 2000, 0), { wheelSkates: true })
    const unknown = await createOrder(h, { requirements: { wheelsRoll: null } })
    const started = await h.service.startDispatch(h.adminId, unknown.id, unknown.version, ctx({ u: 1 }))
    assert.equal(started.status, 200, JSON.stringify(started.body))
    assert.equal((await orderRow(h, unknown.id)).status, 'SEARCHING')
    await h.service.stopDispatch(h.adminId, unknown.id, Number((await orderRow(h, unknown.id)).version), ctx({ u: 2 }))

    const locked = await createOrder(h, { requirements: { wheelsRoll: false, steeringLocked: false, gearboxLocked: true, needsManipulator: false } })
    await startDispatch(h, locked)
    await drain(h)
    const offer = await pendingOffer(h, locked.id)
    assert.equal(offer?.driverId, skates.driverId, 'nearest truck without wheel skates was not offered')
    assert.notEqual(offer?.driverId, plain.driverId)
  })
})
