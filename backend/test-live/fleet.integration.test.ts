import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { availabilityOf, FleetRepository } from '../src/live-dispatch/fleet/fleet.repository'
import { DispatchError } from '../src/live-dispatch/platform/errors'
import { insertTowTruck } from '../src/live-dispatch/test-support/test-db'
import { integrationSkip, isoSecondsAgo, offset, settings, useTestDatabase, YEREVAN } from './helpers'

describe('fleet: sessions, presence, location (real Postgres)', { skip: integrationSkip }, () => {
  const ctx = useTestDatabase()
  const fleet = () => new FleetRepository(ctx.get().pool)

  async function onlineDriver() {
    const towTruckId = await insertTowTruck(ctx.get().pool)
    const { session } = await fleet().createSession({ towTruckId, deviceId: 'dev-a', platform: 'android', appVersion: '1.0.0' })
    await fleet().recordTrackingConsent(towTruckId, 1)
    await fleet().setAvailability(towTruckId, session.id, { wantsOnline: true })
    await fleet().heartbeat(towTruckId, session.id)
    return { towTruckId, sessionId: session.id }
  }

  const fix = (seq: number, secondsAgo: number, point = YEREVAN, accuracyM = 15) => ({
    seq,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyM,
    measuredAt: isoSecondsAgo(secondsAgo),
  })

  it('going online without tracking consent is refused', async () => {
    const towTruckId = await insertTowTruck(ctx.get().pool)
    const { session } = await fleet().createSession({ towTruckId, deviceId: 'd', platform: 'ios', appVersion: null })
    await assert.rejects(
      fleet().setAvailability(towTruckId, session.id, { wantsOnline: true }),
      (e: DispatchError) => e.code === 'TRACKING_CONSENT_REQUIRED',
    )
  })

  it('a fresh fix makes an online driver eligible', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    const result = await fleet().ingestLocations(towTruckId, sessionId, [fix(1, 3)], settings())
    assert.equal(result.currentUpdated, true)
    assert.equal(result.policy.mode, 'IDLE_STATIONARY')
    const state = await fleet().driverState(towTruckId)
    const availability = availabilityOf(state!, settings())
    assert.equal(availability.eligible, true, JSON.stringify(availability))
  })

  it('#7 an OLD fix arriving AFTER a newer one never replaces it', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    const newer = offset(YEREVAN, 500, 0)
    await fleet().ingestLocations(towTruckId, sessionId, [fix(10, 2, newer)], settings())
    const late = await fleet().ingestLocations(towTruckId, sessionId, [fix(9, 20, YEREVAN)], settings())
    assert.equal(late.currentUpdated, false)
    const state = await fleet().driverState(towTruckId)
    assert.equal(state!.latitude, Number(newer.latitude.toFixed(6)))
    // …but it IS kept as history
    const [{ n }] = await ctx.get().pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "DriverLocationHistory" WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
    assert.equal(n, 2)
  })

  it('#7b a replayed fix (same seq) is absorbed: no duplicate history, no change', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    await fleet().ingestLocations(towTruckId, sessionId, [fix(5, 2)], settings())
    const replay = await fleet().ingestLocations(towTruckId, sessionId, [fix(5, 2)], settings())
    assert.equal(replay.currentUpdated, false)
    const [{ n }] = await ctx.get().pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "DriverLocationHistory" WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
    assert.equal(n, 1)
  })

  it('#8 a new heartbeat does not make an old fix fresh', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    await fleet().ingestLocations(towTruckId, sessionId, [fix(1, 100)], settings())
    // Age the stored fix beyond freshness, then send a heartbeat
    await ctx.get().pool.query(
      `UPDATE "DriverLocationCurrent" SET "measuredAt" = now() - interval '200 seconds' WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
    await fleet().heartbeat(towTruckId, sessionId)
    const availability = availabilityOf((await fleet().driverState(towTruckId))!, settings())
    assert.equal(availability.connection, 'FRESH')
    assert.equal(availability.gps, 'STALE')
    assert.equal(availability.eligible, false)
  })

  it('an offline buffer flushed on reconnect becomes history, not the present position', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    await fleet().ingestLocations(towTruckId, sessionId, [fix(1, 2)], settings())
    const before = await fleet().driverState(towTruckId)
    const flushed = await fleet().ingestLocations(
      towTruckId,
      sessionId,
      [fix(2, 900, offset(YEREVAN, 3000, 0)), fix(3, 600, offset(YEREVAN, 4000, 0))],
      settings(),
    )
    assert.equal(flushed.accepted, 2)
    assert.equal(flushed.currentUpdated, false)
    const after = await fleet().driverState(towTruckId)
    assert.equal(after!.latitude, before!.latitude)
    const [{ late }] = await ctx.get().pool.query<{ late: number }>(
      `SELECT count(*) FILTER (WHERE "late")::int AS late FROM "DriverLocationHistory" WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
    assert.equal(late, 2)
  })

  it('device change: the old session is revoked and can no longer write a position', async () => {
    const { towTruckId, sessionId: oldSession } = await onlineDriver()
    await fleet().ingestLocations(towTruckId, oldSession, [fix(100, 2)], settings())
    const { session: newSession, replacedSessionIds } = await fleet().createSession({
      towTruckId,
      deviceId: 'dev-b',
      platform: 'ios',
      appVersion: '1.0.0',
    })
    assert.deepEqual(replacedSessionIds, [oldSession])
    // new device starts its own sequence at 1 — still allowed to take over
    const fresh = await fleet().ingestLocations(towTruckId, newSession.id, [fix(1, 1, offset(YEREVAN, 800, 0))], settings())
    assert.equal(fresh.currentUpdated, true)
    await assert.rejects(
      fleet().ingestLocations(towTruckId, oldSession, [fix(101, 0)], settings()),
      (e: DispatchError) => e.code === 'SESSION_REVOKED',
    )
    await assert.rejects(fleet().heartbeat(towTruckId, oldSession), (e: DispatchError) => e.code === 'SESSION_REVOKED')
  })

  it('two simultaneous logins of the same driver leave exactly one active session', async () => {
    const towTruckId = await insertTowTruck(ctx.get().pool)
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        fleet().createSession({ towTruckId, deviceId: `dev-${i}`, platform: 'android', appVersion: null }),
      ),
    )
    const [{ n }] = await ctx.get().pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "DriverDeviceSession" WHERE "towTruckId" = $1::int AND "revokedAt" IS NULL`,
      [towTruckId],
    )
    assert.equal(n, 1)
  })

  it('concurrent ingests from one session end on the highest sequence', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        fleet().ingestLocations(towTruckId, sessionId, [fix(i + 1, 20 - i, offset(YEREVAN, i * 50, 0))], settings()),
      ),
    )
    const [{ seq }] = await ctx.get().pool.query<{ seq: number }>(
      `SELECT "seq" FROM "DriverLocationCurrent" WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
    assert.equal(seq, 20)
  })

  it('an implausible jump is flagged suspicious (blocks dispatch) and the next consistent fix clears it', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    await fleet().ingestLocations(towTruckId, sessionId, [fix(1, 10)], settings())
    const jump = await fleet().ingestLocations(towTruckId, sessionId, [fix(2, 5, offset(YEREVAN, 60_000, 0))], settings())
    assert.equal(jump.suspicious, true)
    let availability = availabilityOf((await fleet().driverState(towTruckId))!, settings())
    assert.equal(availability.gps, 'SUSPICIOUS')
    // not blocked: the driver is still active and still online
    assert.equal(availability.admin, 'APPROVED')
    const consistent = await fleet().ingestLocations(towTruckId, sessionId, [fix(3, 1, offset(YEREVAN, 60_050, 0))], settings())
    assert.equal(consistent.suspicious, false)
    availability = availabilityOf((await fleet().driverState(towTruckId))!, settings())
    assert.equal(availability.gps, 'FRESH')
  })

  it('logout stops new offers but is not a cancellation; push tokens are revoked', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    await fleet().registerPushToken(sessionId, towTruckId, 'fcm-token-'.padEnd(40, 'x'))
    await fleet().revokeSession(sessionId, 'LOGOUT')
    const state = await fleet().driverState(towTruckId)
    assert.equal(state!.wantsOnline, false)
    const [{ live }] = await ctx.get().pool.query<{ live: number }>(
      `SELECT count(*) FILTER (WHERE "invalidatedAt" IS NULL)::int AS live FROM "PushDeviceToken" WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
    assert.equal(live, 0)
  })

  it('history retention purge removes only old rows', async () => {
    const { towTruckId, sessionId } = await onlineDriver()
    await fleet().ingestLocations(towTruckId, sessionId, [fix(1, 2), fix(2, 1)], settings())
    await ctx.get().pool.query(
      `UPDATE "DriverLocationHistory" SET "receivedAt" = now() - interval '40 days' WHERE "towTruckId" = $1::int AND "seq" = 1`,
      [towTruckId],
    )
    const purged = await fleet().purgeLocationHistory(30)
    assert.ok(purged >= 1)
    const [{ n }] = await ctx.get().pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "DriverLocationHistory" WHERE "towTruckId" = $1::int`,
      [towTruckId],
    )
    assert.equal(n, 1)
  })
})
