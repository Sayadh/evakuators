/**
 * The availability/capability rules exist twice — TypeScript (what screens
 * show) and SQL (what dispatch filters on). This runs both over a spread of
 * real rows and requires the same answer for every one.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { availabilityPredicate, capabilityPredicate, ELIGIBLE_FROM } from '../src/live-dispatch/dispatching/eligibility-sql'
import { availabilityOf } from '../src/live-dispatch/fleet/fleet.repository'
import { capabilityMismatches, type OrderRequirements } from '../src/live-dispatch/orders/domain/requirements'
import { Params } from '../src/live-dispatch/platform/params'
import { insertTowTruck } from '../src/live-dispatch/test-support/test-db'
import { integrationSkip, settings, useTestDatabase } from './helpers'

describe('eligibility parity: TypeScript ≡ SQL (real Postgres)', { skip: integrationSkip }, () => {
  const dbCtx = useTestDatabase()

  it('agrees on 160 randomised drivers × 6 order shapes', async () => {
    const pool = dbCtx.get().pool
    const s = settings()
    const rand = (n: number) => Math.floor(Math.random() * n)
    const trucks: { id: number; vehicleType: string; capacityTons: number; manipulator: boolean; wheelSkates: boolean }[] = []
    for (let i = 0; i < 160; i++) {
      const vehicleType = ['flatbed', 'sliding-platform', 'manipulator', 'heavy-duty'][rand(4)]
      const truck = {
        vehicleType,
        capacityTons: [1.5, 3.5, 7, 20][rand(4)],
        manipulator: rand(4) === 0,
        wheelSkates: rand(3) === 0,
        isActive: rand(8) !== 0,
      }
      const id = await insertTowTruck(pool, truck)
      trucks.push({ id, ...truck })
      const hasPresence = rand(10) !== 0
      if (hasPresence) {
        await pool.query(
          `INSERT INTO "DriverPresence" ("towTruckId","wantsOnline","lastHeartbeatAt","externalBusy","dispatchSuspendedAt","trackingConsentVersion")
           VALUES ($1::int, $2::boolean, now() - make_interval(secs => $3::int), $4::boolean, CASE WHEN $5::boolean THEN now() ELSE NULL END, $6::int)`,
          [id, rand(5) !== 0, [5, 60, 89, 91, 400][rand(5)], rand(6) === 0, rand(10) === 0, rand(8) === 0 ? null : 1],
        )
      }
      if (rand(8) !== 0) {
        const { rows: _ } = { rows: null }
        void _
        const [session] = await pool.query<{ id: string }>(
          `INSERT INTO "DriverDeviceSession" ("towTruckId","deviceId","platform") VALUES ($1::int,'d','ios') RETURNING "id"::text`,
          [id],
        )
        await pool.query(
          `INSERT INTO "DriverLocationCurrent" ("towTruckId","sessionId","seq","latitude","longitude","accuracyM","measuredAt","receivedAt","suspicious")
           VALUES ($1::int, $2::uuid, 1, 40.18, 44.51, $3::real, now() - make_interval(secs => $4::int), now(), $5::boolean)`,
          [id, session.id, [5, 150, 151, 900][rand(4)], [1, 119, 121, 3600][rand(4)], rand(7) === 0],
        )
      }
    }

    const shapes: OrderRequirements[] = [
      { vehicleWeightKg: 1500, wheelsRoll: true, steeringLocked: false, gearboxLocked: false, needsManipulator: false, overridden: false },
      { vehicleWeightKg: 4000, wheelsRoll: true, steeringLocked: false, gearboxLocked: false, needsManipulator: false, overridden: false },
      { vehicleWeightKg: 1500, wheelsRoll: false, steeringLocked: false, gearboxLocked: false, needsManipulator: false, overridden: false },
      { vehicleWeightKg: 1500, wheelsRoll: true, steeringLocked: false, gearboxLocked: false, needsManipulator: true, overridden: false },
      { vehicleWeightKg: 9000, wheelsRoll: true, steeringLocked: true, gearboxLocked: false, needsManipulator: false, overridden: false },
      { vehicleWeightKg: null, wheelsRoll: null, steeringLocked: null, gearboxLocked: null, needsManipulator: null, overridden: true },
    ]

    const { FleetRepository } = await import('../src/live-dispatch/fleet/fleet.repository')
    const fleet = new FleetRepository(pool)
    let eligibleSeen = 0
    for (const shape of shapes) {
      const p = new Params()
      const sqlRows = await pool.query<{ id: number }>(
        `SELECT t."id" FROM ${ELIGIBLE_FROM} WHERE ${availabilityPredicate(p, s)} AND ${capabilityPredicate(p, shape)}`,
        p.values,
      )
      const sqlSet = new Set(sqlRows.map((r) => Number(r.id)))
      for (const truck of trucks) {
        const state = await fleet.driverState(truck.id)
        const tsEligible =
          availabilityOf(state!, s).eligible &&
          capabilityMismatches(shape, { vehicleType: truck.vehicleType, capacityTons: truck.capacityTons, maxLoadTons: null, manipulator: truck.manipulator, wheelSkates: truck.wheelSkates }).length === 0
        assert.equal(sqlSet.has(truck.id), tsEligible, `truck ${truck.id} shape ${JSON.stringify(shape)} state ${JSON.stringify(availabilityOf(state!, s))}`)
        if (tsEligible) eligibleSeen++
      }
    }
    assert.ok(eligibleSeen > 0, 'the spread produced some eligible drivers (the test is not vacuous)')
  })
})
