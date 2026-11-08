/**
 * The mandatory race and failure cases, against a real Postgres with real
 * concurrent connections (the pool opens one connection per in-flight
 * transaction). Numbers refer to the brief's list (§24).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { claimDue } from '../src/live-dispatch/notify/outbox'
import { FakeRoutingProvider } from '../src/live-dispatch/routing/providers'
import { integrationSkip, isoSecondsAgo, offset, useTestDatabase, YEREVAN } from './helpers'
import { count, createOrder, ctx, drain, eligibleDriver, harness, orderRow, overdue, pendingOffer, startDispatch, type Harness } from './support'

describe('races and failures (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh(routing?: FakeRoutingProvider) {
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting", "RoutingUsageDay" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get(), routing)
  }

  async function offeredOrder(point = offset(YEREVAN, 500, 0)) {
    const driver = await eligibleDriver(h, point)
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.towTruckId, driver.towTruckId)
    return { driver, order, offer: offer! }
  }

  const activeAssignments = (orderId: number) =>
    count(h, `SELECT count(*)::int AS n FROM "OrderAssignment" WHERE "orderId" = $1::int AND "endedAt" IS NULL`, [orderId])

  it('#1 twenty simultaneous accepts of the same offer → exactly one assignment', async () => {
    await fresh()
    const { driver, order, offer } = await offeredOrder()
    const results = await Promise.all(Array.from({ length: 20 }, () => h.service.driverAccept(driver.towTruckId, offer.id, ctx())))
    assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)))
    assert.equal(await activeAssignments(order.id), 1)
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderEvent" WHERE "orderId" = $1::int AND "type" = 'OFFER_ACCEPTED'`, [order.id]), 1)
  })

  it('#1b another driver cannot accept an offer that is not theirs (indistinguishable from missing)', async () => {
    await fresh()
    const { order, offer } = await offeredOrder()
    const intruder = await eligibleDriver(h, offset(YEREVAN, 20_000, 0))
    const r = await h.service.driverAccept(intruder.towTruckId, offer.id, ctx())
    assert.equal(r.status, 404)
    assert.equal((r.body as { code: string }).code, 'OFFER_NOT_FOUND')
    assert.equal(await activeAssignments(order.id), 0)
  })

  it('#2 one driver, two orders dispatched at the same time → offered to at most one; the index forbids a second reservation', async () => {
    await fresh()
    const only = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const a = await createOrder(h)
    const b = await createOrder(h)
    await startDispatch(h, a)
    await startDispatch(h, b)
    await Promise.all([h.rt.engine.advance(a.id), h.rt.engine.advance(b.id), h.rt.engine.advance(a.id), h.rt.engine.advance(b.id)])
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderOffer" WHERE "towTruckId" = $1::int AND "status" = 'PENDING'`, [only.towTruckId]), 1)

    // and directly at the database, bypassing every application check:
    const [{ attemptId }] = await h.db.pool.query<{ attemptId: number }>(
      `SELECT "id" AS "attemptId" FROM "DispatchAttempt" WHERE "orderId" = $1::int ORDER BY "id" DESC LIMIT 1`,
      [b.id],
    )
    await assert.rejects(
      h.db.pool.query(
        `INSERT INTO "OrderOffer" ("orderId","attemptId","towTruckId","termsVersion","expiresAt") VALUES ($1::int,$2::int,$3::int,1, now() + interval '30 s')`,
        [b.id, attemptId, only.towTruckId],
      ),
      (e: { constraint?: string }) => e.constraint === 'OrderOffer_one_pending_per_driver' || e.constraint === 'OrderOffer_one_pending_per_order',
    )
  })

  it('#2b a driver can never hold two active assignments, even if the database is written directly', async () => {
    await fresh()
    const { driver, order, offer } = await offeredOrder()
    await h.service.driverAccept(driver.towTruckId, offer.id, ctx())
    const other = await createOrder(h)
    const [{ attemptId }] = await h.db.pool.query<{ attemptId: number }>(
      `INSERT INTO "DispatchAttempt" ("orderId","number","alertAt","deadlineAt","maxOffers") VALUES ($1::int, 1, now(), now() + interval '1 h', 5) RETURNING "id" AS "attemptId"`,
      [other.id],
    )
    const [{ id: offer2 }] = await h.db.pool.query<{ id: string }>(
      `INSERT INTO "OrderOffer" ("orderId","attemptId","towTruckId","termsVersion","expiresAt","status") VALUES ($1::int,$2::int,$3::int,1, now() + interval '30 s','ACCEPTED') RETURNING "id"::text`,
      [other.id, attemptId, driver.towTruckId],
    )
    await assert.rejects(
      h.db.pool.query(`INSERT INTO "OrderAssignment" ("orderId","towTruckId","offerId") VALUES ($1::int,$2::int,$3::uuid)`, [other.id, driver.towTruckId, offer2]),
      (e: { constraint?: string }) => e.constraint === 'OrderAssignment_one_active_per_driver',
    )
    assert.equal(await activeAssignments(order.id), 1)
  })

  it('#3 accept racing expiry, 25 rounds: never both, always one consistent outcome', async () => {
    await fresh()
    let acceptedWins = 0
    let expiryWins = 0
    for (let round = 0; round < 25; round++) {
      // Each round is isolated: a previous round's still-searching order
      // would otherwise (correctly!) grab this round's new driver.
      await fresh()
      const { driver, order, offer } = await offeredOrder(offset(YEREVAN, 300 + round, 0))
      // deadline a few ms from now, then fire both
      await h.db.pool.query(
        `UPDATE "OrderOffer" SET "expiresAt" = now() + make_interval(secs => $2::float8) WHERE "id" = $1::uuid`,
        [offer.id, (round % 5) * 0.004],
      )
      const [acceptResult] = await Promise.all([
        h.service.driverAccept(driver.towTruckId, offer.id, ctx()),
        (async () => {
          await new Promise((r) => setTimeout(r, round % 3))
          return h.rt.offers.expire(offer.id)
        })(),
      ])
      const [{ status }] = await h.db.pool.query<{ status: string }>(`SELECT "status"::text FROM "OrderOffer" WHERE "id" = $1::uuid`, [offer.id])
      const assignments = await activeAssignments(order.id)
      if (status === 'ACCEPTED') {
        acceptedWins++
        assert.equal(acceptResult.status, 200)
        assert.equal(assignments, 1)
      } else {
        expiryWins++
        assert.equal(status, 'EXPIRED')
        assert.equal(assignments, 0)
        assert.equal((acceptResult.body as { code: string }).code, 'OFFER_EXPIRED')
      }
    }
    assert.equal(acceptedWins + expiryWins, 25)
    // Both outcomes must actually have been exercised, or the race was not a race.
    assert.ok(acceptedWins > 0 && expiryWins > 0, `accept won ${acceptedWins}, expiry won ${expiryWins}`)
    console.log(`#3 distribution: accept won ${acceptedWins}, expiry won ${expiryWins}`)
  })

  it('#4 accept racing admin cancel, 20 rounds: a cancelled order never keeps an assignment', async () => {
    await fresh()
    for (let round = 0; round < 20; round++) {
      await fresh()
      const { driver, order, offer } = await offeredOrder(offset(YEREVAN, 300 + round, 0))
      const current = await orderRow(h, order.id)
      const [acceptResult, cancelResult] = await Promise.all([
        h.service.driverAccept(driver.towTruckId, offer.id, ctx()),
        h.service.cancelOrder(h.adminId, order.id, { reason: 'CUSTOMER_DECLINED', expectedVersion: Number(current.version) }, ctx({ c: round })),
      ])
      const row = await orderRow(h, order.id)
      const assignments = await activeAssignments(order.id)
      if (cancelResult.status === 200) {
        assert.equal(row.status, 'CANCELLED')
        assert.equal(assignments, 0, 'cancelled order holds no assignment')
        if (acceptResult.status === 200) {
          // accept won first, cancel ended the assignment afterwards — but the
          // cancel carried an outdated version only if accept committed first
          assert.ok(false, 'accept and a same-version cancel cannot both succeed')
        } else {
          assert.equal((acceptResult.body as { code: string }).code, 'ORDER_CANCELLED')
        }
      } else {
        // cancel lost on the version check because accept committed first
        assert.equal((cancelResult.body as { code: string }).code, 'VERSION_CONFLICT')
        assert.equal(acceptResult.status, 200)
        assert.equal(row.status, 'ASSIGNED')
        assert.equal(assignments, 1)
      }
    }
  })

  it('#5 duplicate accept with the SAME idempotency key → stored response replayed, nothing re-executed', async () => {
    await fresh()
    const { driver, offer } = await offeredOrder()
    const key = 'accept-key-0001'
    const first = await h.service.driverAccept(driver.towTruckId, offer.id, ctx({}, key, `/driver-app/offers/${offer.id}/accept`))
    const again = await Promise.all(
      Array.from({ length: 5 }, () => h.service.driverAccept(driver.towTruckId, offer.id, ctx({}, key, `/driver-app/offers/${offer.id}/accept`))),
    )
    assert.equal(first.replayed, false)
    for (const r of again) {
      assert.deepEqual(r.body, first.body)
      assert.equal(r.replayed, true)
    }
  })

  it('#6 duplicate / stale timeout jobs: one expiry, one advance; a stale job cannot touch an accepted offer', async () => {
    await fresh()
    const { order, offer } = await offeredOrder()
    await eligibleDriver(h, offset(YEREVAN, 2000, 0))
    await overdue(h, offer.id)
    const results = await Promise.all([h.rt.offers.expire(offer.id), h.rt.offers.expire(offer.id), h.rt.offers.expire(offer.id)])
    assert.deepEqual(results.filter(Boolean).length, 1)
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderEvent" WHERE "orderId" = $1::int AND "type" = 'OFFER_EXPIRED'`, [order.id]), 1)
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "dedupeKey" LIKE $1`, [`advance:%:after:${offer.id}`]), 1)

    // Next offer gets accepted; then the OLD expiry job for it fires late
    await drain(h)
    const next = await pendingOffer(h, order.id)
    assert.ok(next)
    await h.service.driverAccept(next.towTruckId, next.id, ctx())
    await overdue(h, next.id).catch(() => undefined)
    assert.equal(await h.rt.offers.expire(next.id), false, 'expiry of an accepted offer is a no-op')
    const [{ status }] = await h.db.pool.query<{ status: string }>(`SELECT "status"::text FROM "OrderOffer" WHERE "id" = $1::uuid`, [next.id])
    assert.equal(status, 'ACCEPTED')
  })

  it('#9 a push processed after the deadline is not sent', async () => {
    await fresh()
    const { offer } = await offeredOrder()
    h.push.sent.length = 0
    await h.db.pool.query(`UPDATE "OutboxEvent" SET "processedAt" = NULL, "attempts" = 0 WHERE "dedupeKey" = $1`, [`push-offer:${offer.id}`])
    await overdue(h, offer.id)
    await drain(h)
    assert.equal(h.push.sent.filter((m) => m.data.offerId === offer.id).length, 0)
    const [{ status }] = await h.db.pool.query<{ status: string }>(
      `SELECT "status" FROM "NotificationDelivery" WHERE "offerId" = $1::uuid AND "channel" = 'PUSH'`,
      [offer.id],
    )
    assert.equal(status, 'SKIPPED')
  })

  it('#10 worker dies after the DB commit, before notifying → the next worker delivers', async () => {
    await fresh()
    const { driver, offer } = await offeredOrder()
    h.events.length = 0
    await h.service.driverAccept(driver.towTruckId, offer.id, ctx())
    // A worker claims the notification rows… and dies (never marks them).
    const claimed = await claimDue(h.db.pool, 'doomed-worker', 50, 1)
    assert.ok(claimed.some((m) => m.topic === 'realtime'))
    assert.equal(h.events.length, 0, 'nothing delivered yet')
    // Lease expires; a healthy worker picks the work up.
    await h.db.pool.query(`UPDATE "OutboxEvent" SET "lockedUntil" = now() - interval '1 second' WHERE "lockedBy" = 'doomed-worker'`)
    await drain(h)
    assert.ok(h.events.some((e) => e.event === 'order.changed' && e.audiences.includes(`driver:${driver.towTruckId}`)))
  })

  it('#11 queue lost (Redis/worker restart) → reconciliation expires the overdue offer and dispatch continues', async () => {
    await fresh()
    const { order, offer } = await offeredOrder()
    const second = await eligibleDriver(h, offset(YEREVAN, 2500, 0))
    // Simulate total loss of scheduled work: every queued job is gone.
    await h.db.pool.query(`DELETE FROM "OutboxEvent"`)
    await overdue(h, offer.id)
    const report = await h.rt.reconciler.run(await h.rt.settings.get())
    assert.equal(report.expiredOffers, 1)
    await drain(h)
    assert.equal((await pendingOffer(h, order.id))?.towTruckId, second.towTruckId)

    // A SEARCHING order with no offer and no job at all is also re-queued
    await h.db.pool.query(`DELETE FROM "OutboxEvent"`)
    await h.db.pool.query(`UPDATE "OrderOffer" SET "status" = 'REVOKED' WHERE "orderId" = $1::int AND "status" = 'PENDING'`, [order.id])
    const again = await h.rt.reconciler.run(await h.rt.settings.get())
    assert.equal(again.requeuedSearches, 1)
  })

  it('#12 connection lost on an active order → alert only, never a second assignment', async () => {
    await fresh()
    const { driver, order, offer } = await offeredOrder()
    await eligibleDriver(h, offset(YEREVAN, 1000, 0))
    await h.service.driverAccept(driver.towTruckId, offer.id, ctx())
    await h.db.pool.query(`UPDATE "OrderAssignment" SET "startedAt" = now() - interval '20 minutes' WHERE "orderId" = $1::int`, [order.id])
    await h.db.pool.query(`UPDATE "DriverLocationCurrent" SET "measuredAt" = now() - interval '15 minutes' WHERE "towTruckId" = $1::int`, [driver.towTruckId])
    await h.db.pool.query(`UPDATE "DriverPresence" SET "lastHeartbeatAt" = now() - interval '15 minutes' WHERE "towTruckId" = $1::int`, [driver.towTruckId])
    const report = await h.rt.reconciler.run(await h.rt.settings.get())
    await drain(h)
    assert.equal(report.gpsLostAlerts, 1)
    assert.equal(report.notMovingAlerts, 1)
    const row = await orderRow(h, order.id)
    assert.equal(row.status, 'ASSIGNED', 'status unchanged')
    assert.equal(await activeAssignments(order.id), 1)
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderOffer" WHERE "orderId" = $1::int AND "status" = 'PENDING'`, [order.id]), 0)
    // running it again raises nothing new (dedupe)
    const again = await h.rt.reconciler.run(await h.rt.settings.get())
    assert.equal(again.gpsLostAlerts + again.notMovingAlerts, 0)
  })

  it('#13 routing: one unroutable driver does not sink the batch; routed ones rank first; unrouted carry no road ETA', async () => {
    const unroutableLatitude = offset(YEREVAN, 200, 0).latitude
    await fresh(new FakeRoutingProvider({ failOrigin: (origin) => Math.abs(origin.latitude - unroutableLatitude) < 1e-5 }))
    const nearestButUnroutable = await eligibleDriver(h, offset(YEREVAN, 200, 0))
    const routable = await eligibleDriver(h, offset(YEREVAN, 1500, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.towTruckId, routable.towTruckId, 'routed candidate is offered before the unroutable nearer one')
    const detail = await h.service.orderDetail(order.id)
    const unrouted = detail.candidates.find((c) => c.towTruckId === nearestButUnroutable.towTruckId)
    assert.equal(unrouted?.routeOk, false)
    assert.equal(unrouted?.etaSeconds, null)
    assert.equal(unrouted?.roadMeters, null)

    // When the WHOLE provider is down, drivers are still offered — with no ETA
    await fresh(new FakeRoutingProvider({ failRequestEvery: 1 }))
    const d = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const order2 = await createOrder(h)
    await startDispatch(h, order2)
    await drain(h)
    const offer2 = await pendingOffer(h, order2.id)
    assert.equal(offer2?.towTruckId, d.towTruckId)
    const snapshot = await h.service.driverSnapshot(d.towTruckId)
    const toPickup = (snapshot.currentOffer as { toPickup: { etaSeconds: number | null; roadMeters: number | null; straightLineMeters: number | null } }).toPickup
    assert.equal(toPickup.etaSeconds, null)
    assert.equal(toPickup.roadMeters, null)
    assert.ok(toPickup.straightLineMeters! > 0, 'straight line is labelled as such, not as road distance')
  })

  it('#14 "free when the list was built" is not "free now": eligibility is re-checked at offer time', async () => {
    await fresh()
    const first = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const second = await eligibleDriver(h, offset(YEREVAN, 1500, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    // Build the candidate list but do not offer yet: run only the expansion
    const settings = await h.rt.settings.get()
    const step = await h.rt.offers.tryCreateNextOffer(order.id, settings)
    assert.equal(step.kind, 'need-candidates')
    await h.rt.engine.advance(order.id) // builds the list AND offers to `first`…
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.towTruckId, first.towTruckId)
    // …now simulate a candidate going stale between list and offer: reject, and make `second` go offline first
    await h.rt.fleet.setAvailability(second.towTruckId, second.sessionId, { wantsOnline: false })
    await h.service.driverReject(first.towTruckId, offer!.id, null, ctx())
    await drain(h)
    assert.equal(await pendingOffer(h, order.id), null, 'offline driver from the old list was not offered')
    const detail = await h.service.orderDetail(order.id)
    assert.equal(detail.candidates.find((c) => c.towTruckId === second.towTruckId)?.skipReason, 'NOT_ELIGIBLE_AT_OFFER')
  })

  it('#16 idempotency key misuse: same key, different body → refused; same key, same body → same result', async () => {
    await fresh()
    const key = 'create-order-key-1'
    const body = { customerPhone: '+37491000002', pickup: { ...YEREVAN, address: 'Abovyan st 1' }, pricing: { mode: 'FIXED', quotedPriceAmd: 1000 } }
    const first = await h.service.createOrder(h.adminId, body, ctx(body, key, '/admin/dispatch-orders'))
    assert.equal(first.status, 201)
    const same = await h.service.createOrder(h.adminId, body, ctx(body, key, '/admin/dispatch-orders'))
    assert.deepEqual(same.body, first.body)
    await assert.rejects(
      h.service.createOrder(h.adminId, { ...body, customerPhone: '+37491000003' }, ctx({ ...body, customerPhone: '+37491000003' }, key, '/admin/dispatch-orders')),
      (e: { code: string }) => e.code === 'IDEMPOTENCY_KEY_REUSED',
    )
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "DispatchOrder" WHERE "customerPhone" IN ('+37491000002','+37491000003')`), 1)
    // key order inside the body does not change the fingerprint
    const reordered = { pricing: body.pricing, pickup: body.pickup, customerPhone: body.customerPhone }
    const replay = await h.service.createOrder(h.adminId, reordered, ctx(reordered, key, '/admin/dispatch-orders'))
    assert.equal(replay.replayed, true)
  })

  it('#17 price changed while an offer is live → old offer cannot be accepted; the same driver is offered the new terms', async () => {
    await fresh()
    const { driver, order, offer } = await offeredOrder()
    const row = await orderRow(h, order.id)
    const updated = await h.service.updateOrder(
      h.adminId,
      order.id,
      { expectedVersion: Number(row.version), pricing: { mode: 'FIXED', quotedPriceAmd: 22000 } },
      ctx({ p: 22000 }),
    )
    assert.equal(updated.status, 200, JSON.stringify(updated.body))
    const late = await h.service.driverAccept(driver.towTruckId, offer.id, ctx())
    assert.equal((late.body as { code: string }).code, 'OFFER_TERMS_CHANGED')
    await drain(h)
    const fresh2 = await pendingOffer(h, order.id)
    assert.equal(fresh2?.towTruckId, driver.towTruckId)
    assert.notEqual(fresh2?.id, offer.id)
    const snapshot = await h.service.driverSnapshot(driver.towTruckId)
    assert.equal((snapshot.currentOffer as { order: { price: { quotedAmd: number } } }).order.price.quotedAmd, 22000)
    const ok = await h.service.driverAccept(driver.towTruckId, fresh2!.id, ctx())
    assert.equal(ok.status, 200)
    const priceEvents = (await h.rt.orders.timeline(order.id)).filter((e) => e.type === 'PRICE_CHANGED')
    assert.equal(priceEvents.length, 1)
  })

  it('#18 cancel request racing a progress update, 15 rounds: one consistent outcome, assignment kept', async () => {
    await fresh()
    for (let round = 0; round < 15; round++) {
      await fresh()
      const { driver, order, offer } = await offeredOrder(offset(YEREVAN, 300 + round, 0))
      await h.service.driverAccept(driver.towTruckId, offer.id, ctx())
      const [request, progress] = await Promise.all([
        h.service.driverRequest(driver.towTruckId, order.id, { kind: 'CANCEL', reason: 'DRIVER_CANNOT_PERFORM' }, ctx({ r: round })),
        h.service.driverProgress(driver.towTruckId, order.id, 'EN_ROUTE', ctx({ p: round })),
      ])
      const row = await orderRow(h, order.id)
      assert.equal(request.status, 201, 'the request always lands')
      assert.equal(row.status, 'NEEDS_ATTENTION')
      assert.equal(await activeAssignments(order.id), 1, 'assignment kept')
      if (progress.status === 200) {
        assert.equal(row.statusBeforeAttention, 'EN_ROUTE_TO_PICKUP', 'progress first, then the request')
      } else {
        assert.equal((progress.body as { code: string }).code, 'INVALID_TRANSITION')
        assert.equal(row.statusBeforeAttention, 'ASSIGNED', 'request first, progress refused')
      }
      assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderDriverRequest" WHERE "orderId" = $1::int AND "status" = 'OPEN'`, [order.id]), 1)
    }
  })

  it('#15 ownership at the data layer: a driver cannot read or move another driver\'s order', async () => {
    await fresh()
    const { driver, order, offer } = await offeredOrder()
    await h.service.driverAccept(driver.towTruckId, offer.id, ctx())
    const stranger = await eligibleDriver(h, offset(YEREVAN, 9000, 0))
    const moved = await h.service.driverProgress(stranger.towTruckId, order.id, 'EN_ROUTE', ctx())
    assert.equal(moved.status, 404)
    const asked = await h.service.driverRequest(stranger.towTruckId, order.id, { kind: 'PROBLEM', reason: 'OTHER', comment: 'x' }, ctx())
    assert.equal(asked.status, 404)
    const snap = await h.service.driverSnapshot(stranger.towTruckId)
    assert.equal(snap.activeOrder, null)
    assert.equal(snap.currentOffer, null)
  })

  it('stale GPS for an otherwise perfect driver → not offered (heartbeat fresh does not help)', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    await h.db.pool.query(`UPDATE "DriverLocationCurrent" SET "measuredAt" = now() - interval '130 seconds' WHERE "towTruckId" = $1::int`, [d.towTruckId])
    await h.rt.fleet.heartbeat(d.towTruckId, d.sessionId)
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    assert.equal(await pendingOffer(h, order.id), null)
    void isoSecondsAgo
  })
})
