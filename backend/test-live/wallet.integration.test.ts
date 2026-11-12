/**
 * Driver wallet (2026-11-12) against a real Postgres: who is offered, what
 * is charged when, what comes back, and that an Idram top-up credits once.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { balanceOf, entriesOf } from '../src/live-dispatch/wallet/wallet-ledger'
import { confirmTopup, createTopup, topupPayable } from '../src/live-dispatch/wallet/wallet-topups'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { createOrder, ctx, drain, eligibleDriver, harness, orderRow, pendingOffer, startDispatch, type Harness } from './support'

describe('Driver wallet (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh(billing = true) {
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting", "RoutingUsageDay" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get())
    await h.setSettings({ walletBillingEnabled: billing ? 1 : 0 })
  }

  async function topUp(driver: { driverId: number; towTruckId: number }, amountAmd: number) {
    const paymentId = await createTopup(h.rt.db, { driverId: driver.driverId, towTruckId: driver.towTruckId, amountAmd })
    assert.equal(await confirmTopup(h.rt.db, paymentId, { provider: 'IDRAM', transactionId: `t-${paymentId}` }), true)
    return paymentId
  }

  it('billing on: a driver who cannot cover the fee is skipped; the one who can is offered and charged at accept', async () => {
    await fresh()
    const broke = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const funded = await eligibleDriver(h, offset(YEREVAN, 2000, 0))
    await topUp(funded, 5000)
    const order = await createOrder(h, { pricing: { mode: 'FIXED', quotedPriceAmd: 25000 } })
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, funded.driverId, 'the nearer driver has no balance')
    const snap = await h.service.driverSnapshot(broke.driverId)
    assert.equal(snap.wallet.low, true)
    assert.ok(snap.availability.reasons.includes('BALANCE_LOW'))

    const accepted = await h.service.driverAccept(funded.driverId, offer!.id, ctx())
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
    // 25 000 ֏ → 7% = 1 750 → 1 800 ֏
    assert.equal(await balanceOf(h.rt.db, funded.driverId), 3200)
    // a replayed accept does not charge again
    await h.service.driverAccept(funded.driverId, offer!.id, ctx())
    assert.equal(await balanceOf(h.rt.db, funded.driverId), 3200)
  })

  it('negotiated price: base fee at accept, settled to the agreed price; operator cancel before arrival refunds it all', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await topUp(d, 10000)
    const order = await createOrder(h, { pricing: { mode: 'NEGOTIATION_REQUIRED' } })
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal((await h.service.driverAccept(d.driverId, offer!.id, ctx())).status, 200)
    assert.equal(await balanceOf(h.rt.db, d.driverId), 9000, 'base 1000 at accept')
    assert.equal((await h.service.driverConfirmPrice(d.driverId, order.id, 30000, ctx({ p: 1 }))).status, 200)
    assert.equal(await balanceOf(h.rt.db, d.driverId), 7900, '30 000 ֏ → 7% = 2 100 ֏ in total')
    const row = await orderRow(h, order.id)
    const cancelled = await h.service.cancelOrder(h.adminId, order.id, { reason: 'CUSTOMER_DECLINED', expectedVersion: Number(row.version) }, ctx({ c: 1 }))
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body))
    assert.equal(await balanceOf(h.rt.db, d.driverId), 10000, 'everything back')
    const kinds = (await entriesOf(h.rt.db, d.driverId, 10, null)).map((e) => e.kind)
    assert.deepEqual(kinds, ['ORDER_FEE_REFUND', 'ORDER_FEE_ADJUSTMENT', 'ORDER_FEE', 'TOPUP'])
  })

  it('the minimum price is free: a 5000 ֏ order is offered with an empty balance and costs nothing; agreed at 5000 ֏, the provisional fee comes back', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const fixed = await createOrder(h, { pricing: { mode: 'FIXED', quotedPriceAmd: 5000 } })
    await startDispatch(h, fixed)
    await drain(h)
    const offer = await pendingOffer(h, fixed.id)
    assert.equal(offer?.driverId, d.driverId, 'offered with a zero balance')
    const snap = await h.service.driverSnapshot(d.driverId)
    assert.deepEqual((snap.currentOffer as { fee: unknown }).fee, { amountAmd: 0, provisional: false })
    await h.service.driverAccept(d.driverId, offer!.id, ctx())
    assert.equal(await balanceOf(h.rt.db, d.driverId), 0)
    await h.service.driverProgress(d.driverId, fixed.id, 'EN_ROUTE', ctx({ a: 1 }))
    await h.service.driverProgress(d.driverId, fixed.id, 'ARRIVED', ctx({ a: 2 }))
    await h.service.driverProgress(d.driverId, fixed.id, 'START_TRANSPORT', ctx({ a: 3 }))
    await h.service.driverProgress(d.driverId, fixed.id, 'COMPLETE', ctx({ a: 4 }))

    await topUp(d, 1000)
    const negotiated = await createOrder(h, { pricing: { mode: 'NEGOTIATION_REQUIRED' } })
    await startDispatch(h, negotiated)
    await drain(h)
    const second = await pendingOffer(h, negotiated.id)
    await h.service.driverAccept(d.driverId, second!.id, ctx({ b: 1 }))
    assert.equal(await balanceOf(h.rt.db, d.driverId), 0, '1000 provisional at accept')

    // A long trip cannot be entered at the minimum price
    await h.db.pool.query(`UPDATE "DispatchOrder" SET "routeMeters" = 8000 WHERE "id" = $1::int`, [negotiated.id])
    const refused = await h.service.driverConfirmPrice(d.driverId, negotiated.id, 5000, ctx({ p: 'long' }))
    assert.equal(refused.status, 409)
    assert.equal((refused.body as { code: string }).code, 'PRICE_TOO_LOW_FOR_DISTANCE')

    // A short one can — but the fee comes back only after the operator's call
    await h.db.pool.query(`UPDATE "DispatchOrder" SET "routeMeters" = 3000 WHERE "id" = $1::int`, [negotiated.id])
    assert.equal((await h.service.driverConfirmPrice(d.driverId, negotiated.id, 5000, ctx({ p: 5000 }))).status, 200)
    assert.equal(await balanceOf(h.rt.db, d.driverId), 0, 'not returned yet: waiting for the review')
    const [review] = await h.rt.orders.pendingPriceReviews()
    assert.equal(review.orderId, negotiated.id)
    assert.equal(review.priceAmd, 5000)
    assert.ok(review.customer.phone && review.driver.phone, 'the operator can call both')
    const approved = await h.service.adminResolvePriceReview(h.adminId, review.id, { decision: 'APPROVE' }, ctx({ r: 1 }))
    assert.equal(approved.status, 200, JSON.stringify(approved.body))
    assert.equal(await balanceOf(h.rt.db, d.driverId), 1000, 'returned after the operator confirmed it')
    // the operator sees who entered the price and what the order cost the driver
    const detail = await h.service.orderDetail(negotiated.id)
    assert.equal(detail.order.price.confirmedBy, 'DRIVER')
    assert.equal(detail.wallet.netFeeAmd, 0)
    assert.equal(detail.priceReviews[0].status, 'APPROVED')
    assert.equal(detail.assignments[0].driverId, d.driverId)
    assert.ok(detail.assignments[0].phone)
    assert.ok(detail.order.customer.phone)
  })

  it('cancelled AFTER arrival: the fee stays', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await topUp(d, 3000)
    const order = await createOrder(h, { pricing: { mode: 'FIXED', quotedPriceAmd: 15000 } })
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    await h.service.driverAccept(d.driverId, offer!.id, ctx())
    await h.service.driverProgress(d.driverId, order.id, 'EN_ROUTE', ctx({ a: 1 }))
    await h.service.driverProgress(d.driverId, order.id, 'ARRIVED', ctx({ a: 2 }))
    const row = await orderRow(h, order.id)
    await h.service.cancelOrder(h.adminId, order.id, { reason: 'CUSTOMER_DECLINED', expectedVersion: Number(row.version) }, ctx({ c: 2 }))
    assert.equal(await balanceOf(h.rt.db, d.driverId), 2000)
  })

  it('billing off: nobody is filtered, nothing is charged', async () => {
    await fresh(false)
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, d.driverId)
    await h.service.driverAccept(d.driverId, offer!.id, ctx())
    assert.equal(await balanceOf(h.rt.db, d.driverId), 0)
    assert.deepEqual(await entriesOf(h.rt.db, d.driverId, 10, null), [])
  })

  it('an Idram confirmation credits once, however often it arrives; a paid bill is no longer payable', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const paymentId = await createTopup(h.rt.db, { driverId: d.driverId, towTruckId: d.towTruckId, amountAmd: 7000 })
    assert.equal(await topupPayable(h.rt.db, paymentId), true)
    assert.equal(await confirmTopup(h.rt.db, paymentId, { provider: 'IDRAM', transactionId: 'x1' }), true)
    assert.equal(await confirmTopup(h.rt.db, paymentId, { provider: 'IDRAM', transactionId: 'x1' }), false)
    assert.equal(await balanceOf(h.rt.db, d.driverId), 7000)
    assert.equal(await topupPayable(h.rt.db, paymentId), false)
    const [{ status }] = await h.db.pool.query<{ status: string }>(`SELECT "status" FROM "SubscriptionPayment" WHERE "id" = $1::int`, [paymentId])
    assert.equal(status, 'PAID')
  })

  it('operator adjustment: moves the balance, is idempotent per key, the note is optional, zero is refused', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const key = 'adjust-1'
    const first = await h.service.adminWalletAdjust(h.adminId, d.driverId, { amountAmd: 2500, note: 'cash at the office' }, ctx({ amountAmd: 2500, note: 'cash at the office' }, key))
    assert.equal(first.status, 200, JSON.stringify(first.body))
    await h.service.adminWalletAdjust(h.adminId, d.driverId, { amountAmd: 2500, note: 'cash at the office' }, ctx({ amountAmd: 2500, note: 'cash at the office' }, key))
    assert.equal(await balanceOf(h.rt.db, d.driverId), 2500)
    // A quick credit: amount only (the admin confirmed it in the panel) — a default note is written
    const quick = await h.service.adminWalletAdjust(h.adminId, d.driverId, { amountAmd: 1000 }, ctx({ amountAmd: 1000 }, 'adjust-2'))
    assert.equal(quick.status, 200, JSON.stringify(quick.body))
    assert.equal(await balanceOf(h.rt.db, d.driverId), 3500)
    const [line] = (await h.db.pool.query(`SELECT "note" FROM "WalletEntry" WHERE "driverId" = $1::int ORDER BY "id" DESC LIMIT 1`, [d.driverId])) as { note: string }[]
    assert.equal(line.note, 'Մուտքագրում ադմինիստրատորի կողմից')
    // …and the driver is told: a push for the credit
    const pushes = await h.db.pool.query(`SELECT 1 FROM "OutboxEvent" WHERE "topic" = 'push.walletCredited' AND "payload"->>'driverId' = $1`, [String(d.driverId)])
    assert.equal(pushes.length, 2)
    await assert.rejects(
      h.service.adminWalletAdjust(h.adminId, d.driverId, { amountAmd: 0 }, ctx({ n: 1 })),
      (error: unknown) => (error as { code?: string }).code === 'VALIDATION_FAILED',
    )
  })

  it('price review CORRECT: the operator enters the real price, the fee follows it, the driver is told', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await topUp(d, 5000)
    const order = await createOrder(h, { pricing: { mode: 'NEGOTIATION_REQUIRED' } })
    await h.db.pool.query(`UPDATE "DispatchOrder" SET "routeMeters" = NULL WHERE "id" = $1::int`, [order.id])
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    await h.service.driverAccept(d.driverId, offer!.id, ctx())
    await h.service.driverConfirmPrice(d.driverId, order.id, 5000, ctx({ p: 1 }))
    const [review] = await h.rt.orders.pendingPriceReviews()
    const corrected = await h.service.adminResolvePriceReview(h.adminId, review.id, { decision: 'CORRECT', correctedPriceAmd: 32000, note: 'customer said 32 000' }, ctx({ r: 2 }))
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body))
    assert.equal((corrected.body as { price: { agreedAmd: number } }).price.agreedAmd, 32000)
    assert.equal(await balanceOf(h.rt.db, d.driverId), 2800, '5000 − 2200 (7% of 32 000 ֏, rounded)')
    await drain(h)
    assert.ok(h.push.sent.some((m) => m.data.type === 'order' && m.data.kind === 'PRICE_CORRECTED'))
  })

  it('credit limit: a trusted driver is offered orders below zero, down to his limit', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const order = await createOrder(h, { pricing: { mode: 'FIXED', quotedPriceAmd: 15000 } })
    const set = await h.service.adminSetCreditLimit(h.adminId, d.driverId, { creditLimitAmd: 2000 }, ctx({ c: 2000 }))
    assert.equal(set.status, 200, JSON.stringify(set.body))
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, d.driverId, 'balance 0 + credit 2000 covers 1000')
    await h.service.driverAccept(d.driverId, offer!.id, ctx())
    assert.equal(await balanceOf(h.rt.db, d.driverId), -1000)
    // the «running low» push was queued once
    await drain(h)
    assert.equal(h.push.sent.filter((m) => m.data.type === 'wallet_low').length, 1)
  })

  it('a large top-up earns its bonus as its own line', async () => {
    await fresh()
    await h.setSettings({ walletBillingEnabled: 1, walletTopupBonusEnabled: 1, walletTopupBonusThresholdsAmd: [20000, 50000], walletTopupBonusPercents: [5, 10] })
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const paymentId = await createTopup(h.rt.db, { driverId: d.driverId, towTruckId: d.towTruckId, amountAmd: 20000 })
    await confirmTopup(h.rt.db, paymentId, { provider: 'IDRAM', transactionId: 'b1' }, await h.rt.settings.get())
    assert.equal(await balanceOf(h.rt.db, d.driverId), 21000)
    assert.deepEqual((await entriesOf(h.rt.db, d.driverId, 10, null)).map((e) => [e.kind, e.amountAmd]), [['TOPUP_BONUS', 1000], ['TOPUP', 20000]])
  })

  it('customer refused after the driver arrived: the operator cancels and chooses to return the fee', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await topUp(d, 3000)
    const order = await createOrder(h, { pricing: { mode: 'FIXED', quotedPriceAmd: 15000 } })
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    await h.service.driverAccept(d.driverId, offer!.id, ctx())
    await h.service.driverProgress(d.driverId, order.id, 'EN_ROUTE', ctx({ a: 1 }))
    await h.service.driverProgress(d.driverId, order.id, 'ARRIVED', ctx({ a: 2 }))
    const row = await orderRow(h, order.id)
    const cancelled = await h.service.cancelOrder(h.adminId, order.id, { reason: 'CUSTOMER_DECLINED', expectedVersion: Number(row.version), refundDriverFee: true }, ctx({ c: 3 }))
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body))
    assert.equal(await balanceOf(h.rt.db, d.driverId), 3000)
  })
})
