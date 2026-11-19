/**
 * «Ազատ է / Զբաղված է» on website cards (2026-11-19) against a real Postgres:
 * the exact query the site runs (APP_PRESENCE_SQL), read through the same rule
 * (appStatusOf), for every app state the owner decided on.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pgArray } from '../src/live-dispatch/platform/sql'
import { insertSiteDriver, insertTowTruck } from '../src/live-dispatch/test-support/test-db'
import {
  APP_PRESENCE_SQL,
  APP_STATUS_MAX_SILENCE_SECONDS,
  appStatusOf,
  type AppPresenceRow,
} from '../src/tow-trucks/app-status'
import { integrationSkip, offset, useTestDatabase, YEREVAN } from './helpers'
import { createOrder, ctx, drain, eligibleDriver, harness, pendingOffer, startDispatch, type Harness } from './support'

describe('app status on website cards (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()
  let h: Harness

  async function statuses(towTruckIds: number[]): Promise<Map<number, string | null>> {
    const rows = await h.db.pool.query<AppPresenceRow>(APP_PRESENCE_SQL, [pgArray(towTruckIds), APP_STATUS_MAX_SILENCE_SECONDS])
    return new Map(
      rows.map((row) => [
        Number(row.towTruckId),
        appStatusOf({ ...row, wantsOnline: Boolean(row.wantsOnline), externalBusy: Boolean(row.externalBusy), suspended: Boolean(row.suspended), onOrder: Boolean(row.onOrder), silentTooLong: Boolean(row.silentTooLong) }),
      ]),
    )
  }

  const presence = (driverId: number, set: string) =>
    h.db.pool.query(`UPDATE "DriverPresence" SET ${set} WHERE "driverId" = $1::int`, [driverId])

  it('free, busy, offline, silent, blocked and no app — one query, one answer each', async () => {
    await h?.db.pool.query('SELECT 1').catch(() => undefined)
    await dbCtx.get().pool.query(`TRUNCATE "DispatchOrder", "OrderOffer", "OutboxEvent", "IdempotencyKey", "DispatchSetting" CASCADE`)
    await dbCtx.get().pool.query(`UPDATE "DriverPresence" SET "wantsOnline" = false`)
    h = await harness(dbCtx.get())

    const free = await eligibleDriver(h, offset(YEREVAN, 300, 0))
    const external = await eligibleDriver(h, offset(YEREVAN, 30_000, 0))
    const offline = await eligibleDriver(h, offset(YEREVAN, 31_000, 0))
    const silent = await eligibleDriver(h, offset(YEREVAN, 32_000, 0))
    const blocked = await eligibleDriver(h, offset(YEREVAN, 33_000, 0))
    const lostConnection = await eligibleDriver(h, offset(YEREVAN, 34_000, 0))
    const noApp = await insertTowTruck(h.db.pool)
    const neverSignedIn = await insertSiteDriver(h.db.pool)
    const accessSuspended = await insertSiteDriver(h.db.pool, { accessStatus: 'SUSPENDED' })

    await presence(external.driverId, `"externalBusy" = true`)
    await presence(offline.driverId, `"wantsOnline" = false`)
    await presence(silent.driverId, `"lastHeartbeatAt" = now() - interval '8 days'`)
    await presence(blocked.driverId, `"dispatchSuspendedAt" = now(), "dispatchSuspendedUntil" = NULL`)
    await presence(lostConnection.driverId, `"lastHeartbeatAt" = now() - interval '2 hours'`)

    // A real accepted order for the nearest driver
    const order = await createOrder(h)
    await startDispatch(h, order)
    await drain(h)
    const offer = await pendingOffer(h, order.id)
    assert.equal(offer?.driverId, free.driverId)
    const accepted = await h.service.driverAccept(free.driverId, offer!.id, ctx())
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))

    const result = await statuses([
      free.towTruckId,
      external.towTruckId,
      offline.towTruckId,
      silent.towTruckId,
      blocked.towTruckId,
      lostConnection.towTruckId,
      noApp,
      neverSignedIn.towTruckId,
      accessSuspended.towTruckId,
    ])

    assert.equal(result.get(free.towTruckId), 'BUSY', 'on an accepted order')
    assert.equal(result.get(external.towTruckId), 'BUSY', 'marked busy outside the app')
    assert.equal(result.get(offline.towTruckId), null, 'Offline → nothing')
    assert.equal(result.get(silent.towTruckId), null, 'silent over a week → nothing')
    assert.equal(result.get(blocked.towTruckId), null, 'blocked by an operator → nothing')
    assert.equal(result.get(lostConnection.towTruckId), 'FREE', 'Online with a lost connection → free (owner\'s choice)')
    assert.equal(result.has(noApp), false, 'no app → no row at all')
    assert.equal(result.get(neverSignedIn.towTruckId) ?? null, null, 'access granted, never went Online → nothing')
    assert.equal(result.has(accessSuspended.towTruckId), false, 'app access suspended → no row')
  })
})
