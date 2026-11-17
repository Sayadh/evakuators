/**
 * Waiting for a free driver (2026-11-16): several orders, few drivers. A
 * search whose matching drivers are all busy with OTHER orders waits for one
 * of them instead of failing at once; a freed driver goes to the OLDEST
 * waiting order first; a search with nobody at all still fails at once; and
 * the wait ends at the attempt's deadline. Real Postgres, plain-SQL finder.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { count, createOrder, ctx, drain, eligibleDriver, harness, orderRow, pendingOffer, startDispatch, type Harness } from './support'

describe('waiting for a free driver (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh() {
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting", "RoutingUsageDay" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get())
  }

  async function dispatched() {
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    return order
  }

  async function waitingSince(orderId: number) {
    const [row] = await h.db.pool.query<{ waitingSince: Date | null }>(
      `SELECT "waitingSince" FROM "DispatchAttempt" WHERE "orderId" = $1::int AND "endedAt" IS NULL`,
      [orderId],
    )
    return row?.waitingSince ?? null
  }

  it('one driver, two orders: the second WAITS (no «driver not found»), and gets him the moment he is free', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const a = await dispatched()
    const b = await dispatched()
    const offerA = await pendingOffer(h, a.id)
    assert.equal(offerA?.driverId, d.driverId)

    const rowB = await orderRow(h, b.id)
    assert.equal(rowB.status, 'SEARCHING', 'not NEEDS_ATTENTION while a matching driver is only busy')
    assert.notEqual(await waitingSince(b.id), null)
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderEvent" WHERE "orderId" = $1::int AND "type" = 'SEARCH_WAITING'`, [b.id]), 1)

    // The driver says no to A → free → B's next look offers him B
    const rejected = await h.service.driverReject(d.driverId, offerA!.id, 'too far', ctx())
    assert.equal(rejected.status, 200)
    await drain(h)
    await h.rt.engine.advance(b.id)
    assert.equal((await pendingOffer(h, b.id))?.driverId, d.driverId)
    assert.equal(await waitingSince(b.id), null, 'the offer ends the wait')
  })

  it('first come, first served: a freed driver goes to the OLDER waiting order, even if the newer one looks first', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const a = await dispatched()
    const b = await dispatched() // waits
    const c = await dispatched() // waits, newer
    const offerA = await pendingOffer(h, a.id)
    await h.service.driverReject(d.driverId, offerA!.id, 'no', ctx())

    // The newer order happens to look first: it must step aside…
    await h.rt.engine.advance(c.id)
    assert.equal(await pendingOffer(h, c.id), null, 'the newer order does not take him')
    // …and the older one, woken by that, offers him
    await drain(h)
    await h.rt.engine.advance(b.id)
    assert.equal((await pendingOffer(h, b.id))?.driverId, d.driverId)
    assert.equal((await orderRow(h, c.id)).status, 'SEARCHING', 'the newer order keeps waiting')
  })

  it('a driver can still never hold two offers: while B holds him, C waits', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    const a = await dispatched()
    const b = await dispatched()
    await h.rt.engine.advance(b.id)
    await h.rt.engine.advance(a.id)
    assert.equal(await count(h, `SELECT count(*)::int AS n FROM "OrderOffer" WHERE "driverId" = $1::int AND "status" = 'PENDING'`, [d.driverId]), 1)
  })

  it('nobody online at all: still fails at once — waiting is only for drivers who are busy', async () => {
    await fresh()
    const order = await dispatched()
    const row = await orderRow(h, order.id)
    assert.equal(row.status, 'NEEDS_ATTENTION')
    assert.equal(row.attentionKind, 'SEARCH_EXHAUSTED')
  })

  it('the wait ends at the attempt deadline: SEARCH_TIMEOUT, never forever', async () => {
    await fresh()
    await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await dispatched()
    const b = await dispatched()
    assert.equal((await orderRow(h, b.id)).status, 'SEARCHING')
    await h.db.pool.query(`UPDATE "DispatchAttempt" SET "deadlineAt" = now() - interval '1 second' WHERE "orderId" = $1::int AND "endedAt" IS NULL`, [b.id])
    await h.rt.engine.advance(b.id)
    const row = await orderRow(h, b.id)
    assert.equal(row.status, 'NEEDS_ATTENTION')
    assert.equal(row.attentionKind, 'SEARCH_TIMEOUT')
  })
})
