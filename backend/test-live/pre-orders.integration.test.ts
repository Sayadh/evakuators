/**
 * Pre-orders (2026-11-17) against a real Postgres: the right drivers are told,
 * prices stay private, a closed pre-order refuses prices, and converting one
 * produces a real FIXED order offered to the chosen driver.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DispatchError } from '../src/live-dispatch/platform/errors'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { ctx, drain, eligibleDriver, harness, orderRow, pendingOffer, type Harness } from './support'

const BODY = {
  pickup: { ...YEREVAN, address: 'Վորտեքս', precision: 'APPROXIMATE' },
  destination: { ...offset(YEREVAN, 8000, 0), address: 'Աբովյան' },
  vehicle: { make: 'Toyota', model: 'Camry', weightKg: 1600 },
  requirements: { wheelsRoll: false, needsWheelSkates: true, wheelSkatesCount: 4 },
  comment: 'Մեքենան քաշել, ռոլիկներ պետք են',
  customerPhone: '+37491000002',
  internalNote: 'Միայն ադմինի համար',
}

describe('Pre-orders (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh() {
    await dbCtx.get().pool.query(`TRUNCATE "PreOrder", "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    await dbCtx.get().pool.query(`UPDATE "FleetDriver" SET "status" = 'SUSPENDED'`)
    h = await harness(dbCtx.get())
    h.push.sent.length = 0
  }

  async function create(body: Record<string, unknown> = BODY) {
    const r = await h.service.createPreOrder(h.adminId, body, ctx(body))
    assert.equal(r.status, 201, JSON.stringify(r.body))
    return r.body as { preOrder: { id: number }; recipients: number }
  }

  it('EVERY active driver is told and sees it, whatever his truck; the push carries no customer', async () => {
    await fresh()
    const ok = await eligibleDriver(h, offset(YEREVAN, 500, 0), { wheelSkates: true })
    const noSkates = await eligibleDriver(h, offset(YEREVAN, 600, 0), { wheelSkates: false })
    const suspended = await eligibleDriver(h, offset(YEREVAN, 700, 0), { wheelSkates: true })
    await h.db.pool.query(`UPDATE "FleetDriver" SET "status" = 'SUSPENDED' WHERE "id" = $1::int`, [suspended.driverId])
    const { preOrder, recipients } = await create()
    assert.equal(recipients, 2, 'both active drivers, the one without skates too; never the suspended one')
    await drain(h)
    const pushes = h.push.sent.filter((m) => m.data?.type === 'pre_order')
    assert.deepEqual(pushes.map((m) => m.token.match(/token-(\d+)-/)?.[1]).sort(), [String(ok.driverId), String(noSkates.driverId)].sort())
    assert.equal(pushes[0].title, 'Նոր նախապատվեր')
    assert.doesNotMatch(`${pushes[0].title} ${pushes[0].body}`, /37491000002/)
    assert.equal((await h.service.driverPreOrders(noSkates.driverId)).length, 1)
    const [seen] = await h.service.driverPreOrders(ok.driverId)
    assert.equal(seen.id, preOrder.id)
    assert.equal(seen.open, true)
    assert.equal(seen.myBidAmd, null)
    assert.ok(seen.distanceMeters !== null && seen.distanceMeters > 400 && seen.distanceMeters < 600)
    const json = JSON.stringify(seen)
    assert.doesNotMatch(json, /37491000002|Միայն ադմինի/)
  })

  it('prices are private, changeable while open, refused once closed; a driver approved AFTER creation sees it and may answer', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0), { wheelSkates: true })
    const b = await eligibleDriver(h, offset(YEREVAN, 900, 0), { wheelSkates: true })
    const { preOrder } = await create()
    const late = await eligibleDriver(h, offset(YEREVAN, 900, 0), { wheelSkates: false })
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 15_000 })
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 12_000 })
    await h.service.driverPreOrderBid(b.driverId, preOrder.id, { priceAmd: 14_000 })
    const [mine] = await h.service.driverPreOrders(b.driverId)
    assert.equal(mine.myBidAmd, 14_000)
    assert.doesNotMatch(JSON.stringify(mine), /12000/)
    assert.equal((await h.service.driverPreOrders(late.driverId))[0].id, preOrder.id)
    await h.service.driverPreOrderBid(late.driverId, preOrder.id, { priceAmd: 20_000 })
    await assert.rejects(h.service.driverPreOrderBid(late.driverId, 999_999, { priceAmd: 1000 }), (e: DispatchError) => e.code === 'PRE_ORDER_NOT_FOUND')
    await assert.rejects(h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 5 }), (e: DispatchError) => e.code === 'VALIDATION_FAILED')
    const detail = await h.rt.preOrders.detail(preOrder.id)
    assert.deepEqual(detail.bids.map((x) => [x.driverId, x.priceAmd]), [[a.driverId, 12_000], [b.driverId, 14_000], [late.driverId, 20_000]])
    assert.equal(detail.recipients, 2, 'reached by the first push round')
    assert.equal((await h.rt.preOrders.list('OPEN'))[0].bestAmd, 12_000)
    assert.deepEqual(await h.rt.preOrders.close(preOrder.id, h.adminId), { closed: true })
    await assert.rejects(h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 11_000 }), (e: DispatchError) => e.code === 'PRE_ORDER_CLOSED')
    await assert.rejects(h.service.driverPreOrderWithdraw(a.driverId, preOrder.id), (e: DispatchError) => e.code === 'PRE_ORDER_CLOSED')
    // He priced it, so it stays in his list as closed
    const [after] = await h.service.driverPreOrders(a.driverId)
    assert.equal(after.open, false)
  })

  it('there is no deadline: a deadline in the body is refused, and an old pre-order still takes prices', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0), { wheelSkates: true })
    await assert.rejects(h.service.createPreOrder(h.adminId, { ...BODY, deadlineMinutes: 60 }, ctx({ d: 1 })), (e: DispatchError) => e.code === 'VALIDATION_FAILED')
    // Where it goes is required
    const { destination: _d, ...noDestination } = BODY
    await assert.rejects(h.service.createPreOrder(h.adminId, noDestination, ctx({ d: 2 })), (e: DispatchError) => e.code === 'VALIDATION_FAILED')
    await assert.rejects(h.service.createPreOrder(h.adminId, { ...BODY, destination: null }, ctx({ d: 3 })), (e: DispatchError) => e.code === 'VALIDATION_FAILED')
    await assert.rejects(h.service.createPreOrder(h.adminId, { ...BODY, destination: { latitude: null, longitude: null, address: ' ' } }, ctx({ d: 4 })), (e: DispatchError) => e.code === 'VALIDATION_FAILED')
    const { preOrder } = await create()
    await h.db.pool.query(`UPDATE "PreOrder" SET "createdAt" = now() - interval '10 days' WHERE "id" = $1::int`, [preOrder.id])
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 9000 })
    assert.equal((await h.service.driverPreOrders(a.driverId))[0].open, true)
  })

  it('convert: a FIXED order at his price, offered to him; the pre-order stays open; a second driver gets a second order', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0), { wheelSkates: true })
    const b = await eligibleDriver(h, offset(YEREVAN, 300, 0), { wheelSkates: true })
    const { preOrder } = await create()
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 13_000 })
    await h.service.driverPreOrderBid(b.driverId, preOrder.id, { priceAmd: 11_000 })
    const r = await h.service.convertPreOrder(h.adminId, preOrder.id, { driverId: a.driverId }, ctx({ driverId: a.driverId }))
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const body = r.body as { orderId: number; offered: boolean; offerError: string | null }
    assert.equal(body.offered, true, String(body.offerError))
    const order = await orderRow(h, body.orderId)
    assert.equal(order.pricingMode, 'FIXED')
    assert.equal(Number(order.quotedPriceAmd), 13_000)
    assert.equal(order.customerPhone, '+37491000002')
    assert.equal((await pendingOffer(h, body.orderId))?.driverId, a.driverId)
    let detail = await h.rt.preOrders.detail(preOrder.id)
    assert.equal(detail.preOrder.status, 'OPEN', 'converting never closes it')
    assert.deepEqual(detail.orders.map((o) => [o.orderId, o.driverId, o.priceAmd, o.offerStatus]), [[body.orderId, a.driverId, 13_000, 'PENDING']])
    const [mine] = await h.service.driverPreOrders(a.driverId)
    assert.equal(mine.chosen, true)
    assert.equal(mine.open, true)
    const [other] = await h.service.driverPreOrders(b.driverId)
    assert.equal(other.chosen, false)
    // a declines; the operator gives it to b — a second order
    const offer = await pendingOffer(h, body.orderId)
    assert.equal((await h.service.driverReject(a.driverId, offer!.id, null, ctx({ r: 1 }))).status, 200)
    const again = await h.service.convertPreOrder(h.adminId, preOrder.id, { driverId: b.driverId }, ctx({ driverId: b.driverId }))
    assert.equal(again.status, 201, JSON.stringify(again.body))
    const second = again.body as { orderId: number; offered: boolean }
    assert.notEqual(second.orderId, body.orderId)
    assert.equal(second.offered, true)
    assert.equal(Number((await orderRow(h, second.orderId)).quotedPriceAmd), 11_000)
    detail = await h.rt.preOrders.detail(preOrder.id)
    assert.equal(detail.orders.length, 2)
    assert.equal(detail.orders[0].offerStatus, 'REJECTED')
    assert.equal((await h.rt.preOrders.list('OPEN'))[0].orders, 2)
    // Bids still taken; only the operator closes it
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 12_500 })
  })

  it('convert without a stored phone needs one; a driver without a price is refused', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0), { wheelSkates: true })
    const { preOrder } = await create({ ...BODY, customerPhone: null })
    await assert.rejects(h.service.convertPreOrder(h.adminId, preOrder.id, { driverId: a.driverId }, ctx({})), (e: DispatchError) => e.code === 'VALIDATION_FAILED')
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 10_000 })
    await assert.rejects(h.service.convertPreOrder(h.adminId, preOrder.id, { driverId: a.driverId }, ctx({})), (e: DispatchError) => e.code === 'VALIDATION_FAILED')
    const r = await h.service.convertPreOrder(h.adminId, preOrder.id, { driverId: a.driverId, customerPhone: '091 000 003' }, ctx({ p: 1 }))
    assert.equal(r.status, 201, JSON.stringify(r.body))
  })

  it('convert: a maximal operator note still fits the order (the prefix is trimmed, not refused)', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0), { wheelSkates: true })
    const { preOrder } = await create({ ...BODY, internalNote: 'ն'.repeat(2000) })
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 10_000 })
    const r = await h.service.convertPreOrder(h.adminId, preOrder.id, { driverId: a.driverId }, ctx({ n: 1 }))
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const order = await orderRow(h, (r.body as { orderId: number }).orderId)
    assert.equal(String(order.internalNote).length, 2000)
    assert.match(String(order.internalNote), /^Նախապատվեր #/)
  })

  it('«Կրկին ծանուցել»: a second round reaches every active driver (newcomers too) as a reminder; refused once closed', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const { preOrder } = await create()
    await drain(h)
    const b = await eligibleDriver(h, offset(YEREVAN, 600, 0))
    h.push.sent.length = 0
    // Right after creation: too soon — two rounds must not wake every phone twice
    const tooSoon = await h.service.notifyPreOrder(h.adminId, preOrder.id, ctx({ n: 0 }))
    assert.equal(tooSoon.status, 429)
    assert.equal((tooSoon.body as { code: string }).code, 'PRE_ORDER_NOTIFY_TOO_SOON')
    assert.ok(Number((tooSoon.body as { details: { retryAfterSeconds: number } }).details.retryAfterSeconds) > 0)
    await h.db.pool.query(`UPDATE "PreOrder" SET "notifiedAt" = now() - interval '3 minutes' WHERE "id" = $1::int`, [preOrder.id])
    const r = await h.service.notifyPreOrder(h.adminId, preOrder.id, ctx({ n: 1 }))
    assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.deepEqual(r.body, { notified: 2, round: 2 })
    await drain(h)
    const pushes = h.push.sent.filter((m) => m.data?.type === 'pre_order')
    assert.equal(pushes.length, 2)
    assert.match(pushes[0].title, /խնդրում ենք նայել/)
    assert.ok(pushes.some((m) => m.token.includes(`token-${b.driverId}-`)))
    assert.ok(pushes.some((m) => m.token.includes(`token-${a.driverId}-`)))
    const detail = await h.rt.preOrders.detail(preOrder.id)
    assert.equal(detail.preOrder.notify.rounds, 2)
    await h.rt.preOrders.close(preOrder.id, h.adminId)
    const refused = await h.service.notifyPreOrder(h.adminId, preOrder.id, ctx({ n: 2 }))
    assert.equal(refused.status, 409)
    assert.equal((refused.body as { code: string }).code, 'PRE_ORDER_CLOSED')
  })

  it('a hundred open pre-orders: every driver sees all of them', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    for (let i = 0; i < 100; i++) await create({ ...BODY, comment: `#${i}` })
    assert.equal((await h.service.driverPreOrders(a.driverId)).length, 100)
  })

  it('monthly purge: closed ones of past months go (with their prices), this month and every open one stay', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const oldClosed = (await create()).preOrder.id
    const oldOpen = (await create()).preOrder.id
    const thisMonthClosed = (await create()).preOrder.id
    await h.service.driverPreOrderBid(a.driverId, oldClosed, { priceAmd: 9000 })
    await h.rt.preOrders.close(oldClosed, h.adminId)
    await h.rt.preOrders.close(thisMonthClosed, h.adminId)
    await h.db.pool.query(`UPDATE "PreOrder" SET "createdAt" = now() - interval '70 days', "closedAt" = now() - interval '40 days' WHERE "id" = $1::int`, [oldClosed])
    await h.db.pool.query(`UPDATE "PreOrder" SET "createdAt" = now() - interval '70 days' WHERE "id" = $1::int`, [oldOpen])
    assert.equal(await h.rt.preOrders.purgePastMonths(), 1)
    assert.equal(await h.rt.preOrders.purgePastMonths(), 0, 'idempotent')
    const left = (await h.db.pool.query<{ id: number }>(`SELECT "id" FROM "PreOrder" ORDER BY "id"`)).map((r) => Number(r.id))
    assert.deepEqual(left, [oldOpen, thisMonthClosed])
    assert.equal((await h.db.pool.query(`SELECT 1 FROM "PreOrderBid" WHERE "preOrderId" = $1::int`, [oldClosed])).length, 0)
  })

  it('refused while LIVE_DISPATCH_ENABLED is off: create, convert and re-notify — nothing queued, no order made', async () => {
    await fresh()
    const a = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const { preOrder } = await create()
    await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 9000 })
    const config = h.rt.config as { enabled: boolean }
    config.enabled = false
    try {
      const outbox = async () => Number((await h.db.pool.query<{ n: number }>(`SELECT count(*)::int AS "n" FROM "OutboxEvent"`))[0].n)
      const before = await outbox()
      await assert.rejects(h.service.createPreOrder(h.adminId, BODY, ctx({ off: 1 })), (e: DispatchError) => e.code === 'FEATURE_DISABLED')
      await assert.rejects(h.service.notifyPreOrder(h.adminId, preOrder.id, ctx({ off: 2 })), (e: DispatchError) => e.code === 'FEATURE_DISABLED')
      await assert.rejects(h.service.convertPreOrder(h.adminId, preOrder.id, { driverId: a.driverId }, ctx({ off: 3 })), (e: DispatchError) => e.code === 'FEATURE_DISABLED')
      assert.equal(await outbox(), before)
      assert.equal((await h.db.pool.query(`SELECT 1 FROM "PreOrderConversion"`)).length, 0)
      // A driver can still answer an open one
      await h.service.driverPreOrderBid(a.driverId, preOrder.id, { priceAmd: 8500 })
    } finally {
      config.enabled = true
    }
  })
})
