import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import type { TowTruckFilters, TowTruckWhere } from '../src/tow-trucks/tow-truck.types'
import { MANIPULATOR_VEHICLE_TYPE } from '../src/tow-trucks/vehicle-types'

/**
 * The `vehicleType` half of `GET /tow-trucks` — what powers `/manipulator` and
 * `/tsanr-tehnika`.
 *
 * Two properties matter here and neither is visible by eyeballing a result
 * list: that the type NARROWS the geography instead of widening it, and that
 * `manipulator` is a union rather than an equality.
 */

/** Reaches the private query builder — the thing under test is the WHERE it produces */
function buildWhere(filters: TowTruckFilters): TowTruckWhere {
  const repository = new TowTrucksRepository({} as never)
  return (
    repository as unknown as { buildWhere: (f: TowTruckFilters) => TowTruckWhere }
  ).buildWhere(filters)
}

describe('vehicle type narrows, never widens', () => {
  it('ANDs with the geography clause instead of joining it', () => {
    // The bug this prevents: pushing the type into `or` turns "manipulators in
    // Kotayk" into "everything in Kotayk OR every manipulator in the country",
    // which reads as the page merely returning too much.
    const where = buildWhere({ regionSlug: 'kotayk', vehicleType: 'heavy-duty' })

    expect(where.vehicleType).toBe('heavy-duty')
    // The geography stays its own OR, untouched by the type
    expect(Array.isArray(where.OR)).toBe(true)
    expect(JSON.stringify(where.OR)).not.toContain('heavy-duty')
  })

  it('applies on its own with no geography at all', () => {
    // Which is how both landing pages call it: country-wide, one type.
    const where = buildWhere({ vehicleType: 'heavy-duty' })

    expect(where.vehicleType).toBe('heavy-duty')
    expect(where.OR).toBeUndefined()
    expect(where.isActive).toBe(true)
  })

  it('never returns deactivated trucks', () => {
    expect(buildWhere({ vehicleType: 'heavy-duty' }).isActive).toBe(true)
  })

  it('adds nothing when no type is asked for', () => {
    const where = buildWhere({ citySlug: 'abovyan' })
    expect(where.vehicleType).toBeUndefined()
    expect(where.AND).toBeUndefined()
  })
})

describe('manipulator is a union, not an equality', () => {
  /**
   * «Մանիպուլյատոր» is asked twice at registration — the vehicle type and the
   * equipment checkbox — and either answer counts (see vehicle-types.ts).
   * Writes derive the column now, so new rows agree; rows written before that
   * do not, and nothing migrated them. A plain equality would drop exactly
   * those drivers from the page built for them.
   */
  it('matches the vehicle type OR the equipment flag', () => {
    const where = buildWhere({ vehicleType: MANIPULATOR_VEHICLE_TYPE })

    expect(where.vehicleType).toBeUndefined()
    expect(where.AND).toEqual([
      { OR: [{ vehicleType: MANIPULATOR_VEHICLE_TYPE }, { manipulator: true }] },
    ])
  })

  it('uses AND so it can coexist with a geography OR', () => {
    // An object cannot carry two `OR` keys — putting the union in `AND` is what
    // lets "manipulators in Kotayk" be expressible at all.
    const where = buildWhere({ regionSlug: 'kotayk', vehicleType: MANIPULATOR_VEHICLE_TYPE })

    expect(Array.isArray(where.OR)).toBe(true)
    expect(Array.isArray(where.AND)).toBe(true)
    expect(JSON.stringify(where.AND)).toContain('manipulator')
  })

  it('does not apply the union to any other type', () => {
    // Guards against the union leaking into every vehicle type, which would
    // silently put manipulator-equipped flatbeds on the heavy-duty page.
    const where = buildWhere({ vehicleType: 'flatbed' })
    expect(where.AND).toBeUndefined()
    expect(where.vehicleType).toBe('flatbed')
  })
})

describe('an unknown slug answers honestly', () => {
  it('filters on it rather than ignoring it', () => {
    // The taxonomy lives in the frontend, so the DTO cannot whitelist members
    // without growing a fourth copy of it. An unknown slug matching nothing is
    // the correct answer — the page renders its empty state — and is much
    // better than silently returning the whole fleet.
    const where = buildWhere({ vehicleType: 'no-such-type' })
    expect(where.vehicleType).toBe('no-such-type')
  })
})
