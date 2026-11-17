/**
 * Referred orders (2026-11-17) against a real Postgres: a driver hands an
 * order to us, another completes it, the referrer gets his share of the fee —
 * once, at the right moment, and never for the wrong reasons.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { balanceOf, entriesOf } from '../src/live-dispatch/wallet/wallet-ledger'
import { confirmTopup, createTopup } from '../src/live-dispatch/wallet/wallet-topups'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { createOrder, ctx, drain, eligibleDriver, harness, orderRow, pendingOffer, startDispatch, type Harness } from './support'

describe('Referred orders (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh(billing = true) {
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get())
    await h.setSettings({ walletBillingEnabled: billing ? 1 : 0 })
  }

  async function topUp(driver: { driverId: number; towTruckId: number }, amountAmd: number) {
    const paymentId = await createTopup(h.rt.db, { driverId: driver.driverId, towTruckId: driver.towTruckId, amountAmd })
    await confirmTopup(h.rt.db, paymentId, { provider: 'IDRAM', transactionId: `t-${paymentId}` })
  }

  /** The referrer is far away and offline, so the job goes to `worker` */
  async function referredOrder(price: number | null, referrerId: number, worker: { driverId: number }) {
    const order = await createOrder(h, {
      referrerDriverId: referrerId,
      pricing: price === null ? { mode: 'NEGOTIATION_REQUIRED' } : { mode: 'FIXED', quotedPriceAmd: price },
    })
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, worker.driverId)
    assert.equal((await h.service.driverAccept(worker.driverId, offer!.id, ctx({ a: order.id }))).status, 200)
    return order
  }

  async function complete(driverId: number, orderId: number) {
    for (const [i, action] of (['EN_ROUTE', 'ARRIVED', 'START_TRANSPORT', 'COMPLETE'] as const).entries()) {
      const r = await h.service.driverProgress(driverId, orderId, action, ctx({ p: `${orderId}-${i}` }))
      assert.equal(r.status, 200, JSON.stringify(r.body))
    }
  }

  it('5 001–15 000 ֏ → fee 1 000 → the referrer gets 800 on completion, once; the worker paid 1 000', async () => {
    await fresh()
    const worker = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const referrer = await eligibleDriver(h, offset(YEREVAN, 40_000, 0))
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false WHERE "driverId" = $1::int`, [referrer.driverId])
    await topUp(worker, 5000)
    const order = await referredOrder(12_000, referrer.driverId, worker)
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 0, 'nothing before completion')
    await complete(worker.driverId, order.id)
    assert.equal(await balanceOf(h.rt.db, worker.driverId), 4000)
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 800)
    const [line] = await entriesOf(h.rt.db, referrer.driverId, 5, null)
    assert.equal(line.kind, 'REFERRAL_CREDIT')
    assert.equal(line.orderId, order.id)
    const detail = await h.service.orderDetail(order.id)
    assert.deepEqual({ status: detail.referral?.status, creditedAmd: detail.referral?.creditedAmd }, { status: 'CREDITED', creditedAmd: 800 })
    assert.equal(detail.wallet.netFeeAmd, 1000, 'the referral is not counted as a fee')
    // Second completion path cannot pay twice
    const { creditReferrer } = await import('../src/live-dispatch/orders/orders.repository')
    const row = await orderRow(h, order.id)
    void row
    const [assignment] = await h.db.pool.query<{ id: number }>(`SELECT "id" FROM "OrderAssignment" WHERE "orderId" = $1::int`, [order.id])
    assert.equal(await h.rt.db.transaction((tx) => creditReferrer(tx, order.id, assignment.id)), 'skipped')
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 800)
  })

  it('billing off: paid anyway, from the fee the schedule would have charged (25 000 ֏ → 1 800 → 1 440)', async () => {
    await fresh(false)
    const worker = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const referrer = await eligibleDriver(h, offset(YEREVAN, 40_000, 0))
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false WHERE "driverId" = $1::int`, [referrer.driverId])
    const order = await referredOrder(25_000, referrer.driverId, worker)
    await complete(worker.driverId, order.id)
    assert.equal(await balanceOf(h.rt.db, worker.driverId), 0, 'the worker paid nothing')
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 1440)
  })

  it('nothing when: the referrer did the job himself · a free (minimum-price) order · the order was cancelled', async () => {
    await fresh()
    const referrer = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    await topUp(referrer, 5000)
    const own = await referredOrder(12_000, referrer.driverId, referrer)
    await complete(referrer.driverId, own.id)
    assert.equal((await h.service.orderDetail(own.id)).referral?.skipReason, 'REFERRER_DID_THE_JOB')
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 4000, 'his own fee only, no share of it')

    const worker = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false WHERE "driverId" = $1::int`, [referrer.driverId])
    const free = await referredOrder(5_000, referrer.driverId, worker)
    await complete(worker.driverId, free.id)
    assert.equal((await h.service.orderDetail(free.id)).referral?.skipReason, 'NO_FEE')

    await topUp(worker, 5000)
    const cancelled = await referredOrder(12_000, referrer.driverId, worker)
    const row = await orderRow(h, cancelled.id)
    await h.service.cancelOrder(h.adminId, cancelled.id, { reason: 'CUSTOMER_DECLINED', expectedVersion: Number(row.version) }, ctx({ c: 1 }))
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 4000)
    assert.equal((await entriesOf(h.rt.db, referrer.driverId, 10, null)).filter((e) => e.kind === 'REFERRAL_CREDIT').length, 0)
  })

  it('a minimum price under review: the share waits for the operator, then follows his decision', async () => {
    await fresh()
    const worker = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const referrer = await eligibleDriver(h, offset(YEREVAN, 40_000, 0))
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false WHERE "driverId" = $1::int`, [referrer.driverId])
    await topUp(worker, 5000)
    const order = await referredOrder(null, referrer.driverId, worker)
    await h.db.pool.query(`UPDATE "DispatchOrder" SET "routeMeters" = 3000 WHERE "id" = $1::int`, [order.id])
    assert.equal((await h.service.driverConfirmPrice(worker.driverId, order.id, 5000, ctx({ p: 'min' }))).status, 200)
    await complete(worker.driverId, order.id)
    assert.equal((await h.service.orderDetail(order.id)).referral?.status, 'WAITING')
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 0)
    // The operator called: it was really 20 000 ֏ → fee 1 400 → share 1 120
    const [review] = await h.rt.orders.pendingPriceReviews()
    const corrected = await h.service.adminResolvePriceReview(h.adminId, review.id, { decision: 'CORRECT', correctedPriceAmd: 20_000 }, ctx({ r: 1 }))
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body))
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 1120)
    assert.equal((await h.service.orderDetail(order.id)).referral?.status, 'CREDITED')
  })

  it('a referrer that does not exist is refused; the share percent is a setting', async () => {
    await fresh()
    await assert.rejects(() => createOrder(h, { referrerDriverId: 999_999 }), /referrerDriverId|VALIDATION/)
    await h.setSettings({ walletBillingEnabled: 1, walletReferralSharePercent: 50 })
    const worker = await eligibleDriver(h, offset(YEREVAN, 400, 0))
    const referrer = await eligibleDriver(h, offset(YEREVAN, 40_000, 0))
    await h.db.pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false WHERE "driverId" = $1::int`, [referrer.driverId])
    await topUp(worker, 5000)
    const order = await referredOrder(12_000, referrer.driverId, worker)
    await complete(worker.driverId, order.id)
    assert.equal(await balanceOf(h.rt.db, referrer.driverId), 500)
  })
})
