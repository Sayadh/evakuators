/**
 * Auto-Offline (2026-11-18) against a real Postgres: three offers in a row
 * that never reached the phone take the driver Offline; a delivered one in
 * between resets the count; pressing Online brings him back and clears it.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { unreachableByOffers } from '../src/live-dispatch/fleet/auto-offline'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { createOrder, drain, eligibleDriver, harness, overdue, pendingOffer, startDispatch, type Harness } from './support'

describe('auto-Offline after undelivered offers (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function fresh() {
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get())
  }

  /** One order offered to the (only) driver, then expired — delivered or not */
  async function offerAndExpire(driverId: number, delivered: boolean) {
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, driverId)
    if (delivered) await h.db.pool.query(`UPDATE "OrderOffer" SET "deliveredAt" = now() WHERE "id" = $1::uuid`, [offer!.id])
    await overdue(h, offer!.id)
    assert.equal(await h.rt.offers.expire(offer!.id), true)
    // Cancel it so the next order's search does not wait behind it
    await h.db.pool.query(`UPDATE "DispatchOrder" SET "status" = 'CANCELLED', "cancelledAt" = now() WHERE "id" = $1::int`, [order.id]).catch(() => undefined)
  }

  const wantsOnline = async (driverId: number) =>
    Boolean((await h.db.pool.query<{ w: boolean }>(`SELECT "wantsOnline" AS "w" FROM "DriverPresence" WHERE "driverId" = $1::int`, [driverId]))[0].w)

  it('the rule itself: the newest N all expired undelivered', () => {
    const u = { status: 'EXPIRED', delivered: false }
    assert.equal(unreachableByOffers([u, u, u]), true)
    assert.equal(unreachableByOffers([u, u]), false, 'fewer than 3 offers ever')
    assert.equal(unreachableByOffers([u, { status: 'EXPIRED', delivered: true }, u]), false, 'delivered in between')
    assert.equal(unreachableByOffers([u, u, { status: 'REJECTED', delivered: true }, u]), false)
    assert.equal(unreachableByOffers([{ status: 'REVOKED', delivered: false }, u, u]), false, 'withdrawn by us is not his phone failing')
  })

  it('3 undelivered in a row → Offline with the reason; the app and the console see it; Online clears it', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await offerAndExpire(d.driverId, false)
    await offerAndExpire(d.driverId, false)
    assert.equal(await wantsOnline(d.driverId), true, 'two are not enough')
    await offerAndExpire(d.driverId, false)
    assert.equal(await wantsOnline(d.driverId), false)

    const snapshot = await h.service.driverSnapshot(d.driverId)
    assert.equal(snapshot.driver.autoOffline?.reason, 'UNDELIVERED_OFFERS')
    assert.equal(snapshot.switches.wantsOnline, false)
    const view = await h.rt.access.get(d.driverId)
    assert.equal(view.autoOffline?.reason, 'UNDELIVERED_OFFERS')

    // No more offers while Offline
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    assert.equal(await pendingOffer(h, order.id), null)

    // He opens the app and presses Online: back, and the mark is gone
    await h.rt.fleet.setAvailability(d.driverId, d.sessionId, { wantsOnline: true })
    assert.equal(await wantsOnline(d.driverId), true)
    assert.equal((await h.service.driverSnapshot(d.driverId)).driver.autoOffline, null)
    assert.equal((await h.rt.access.get(d.driverId)).autoOffline, null)
  })

  it('a delivered offer in between resets the count', async () => {
    await fresh()
    const d = await eligibleDriver(h, offset(YEREVAN, 500, 0))
    await offerAndExpire(d.driverId, false)
    await offerAndExpire(d.driverId, false)
    await offerAndExpire(d.driverId, true)
    await offerAndExpire(d.driverId, false)
    await offerAndExpire(d.driverId, false)
    assert.equal(await wantsOnline(d.driverId), true)
    await offerAndExpire(d.driverId, false)
    assert.equal(await wantsOnline(d.driverId), false)
  })
})
