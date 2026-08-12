import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import type { TowTruckFilters, TowTruckWhere } from '../src/tow-trucks/tow-truck.types'
import {
  HEAVY_DUTY_VEHICLE_TYPE,
  MANIPULATOR_VEHICLE_TYPE,
} from '../src/tow-trucks/vehicle-types'

/**
 * The `vehicleType` half of `GET /tow-trucks` — what powers `/manipulator` and
 * `/tsanr-tehnika`.
 *
 * Two properties matter here and neither is visible by eyeballing a result
 * list: that the type NARROWS the geography instead of widening it, and that
 * BOTH landing-page types are unions rather than equalities.
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
    // The bug this prevents: pushing the type into `or` turns "flatbeds in
    // Kotayk" into "everything in Kotayk OR every flatbed in the country",
    // which reads as the page merely returning too much.
    const where = buildWhere({ regionSlug: 'kotayk', vehicleType: 'flatbed' })

    expect(where.vehicleType).toBe('flatbed')
    // The geography stays its own OR, untouched by the type
    expect(Array.isArray(where.OR)).toBe(true)
    expect(JSON.stringify(where.OR)).not.toContain('flatbed')
  })

  it('applies on its own with no geography at all', () => {
    // Which is how both landing pages call it: country-wide, one type.
    const where = buildWhere({ vehicleType: 'flatbed' })

    expect(where.vehicleType).toBe('flatbed')
    expect(where.OR).toBeUndefined()
    expect(where.isActive).toBe(true)
  })

  it('never returns deactivated trucks, for either union type', () => {
    // `isActive` is the only publication flag this system has, and a union
    // branch that forgot it would publish every deactivated truck on a landing
    // page — the one place the extra `AND` makes it easy to forget.
    expect(buildWhere({ vehicleType: 'flatbed' }).isActive).toBe(true)
    expect(buildWhere({ vehicleType: MANIPULATOR_VEHICLE_TYPE }).isActive).toBe(true)
    expect(buildWhere({ vehicleType: HEAVY_DUTY_VEHICLE_TYPE }).isActive).toBe(true)
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

  it('does not confuse the two unions with each other', () => {
    // Both branches build the same shape, so a copy-paste that left the wrong
    // column in place would still produce a valid-looking WHERE — and quietly
    // fill each landing page with the other page's trucks.
    expect(JSON.stringify(buildWhere({ vehicleType: MANIPULATOR_VEHICLE_TYPE })))
      .not.toContain('heavyEquipment')
    expect(JSON.stringify(buildWhere({ vehicleType: HEAVY_DUTY_VEHICLE_TYPE })))
      .not.toContain('manipulator')
  })
})

describe('heavy duty is a union too — the admin flag, not just the type', () => {
  /**
   * «Ծանր տեխնիկա» has two sources: the vehicle type a driver picked, and an
   * admin-set flag on any other truck (a long-platform flatbed, a manipulator
   * with a big crane). A plain equality would keep the page to trucks that
   * happened to choose one taxonomy entry, which is the whole thing the flag
   * exists to fix. See `derivesHeavyEquipment`.
   */
  it('matches the vehicle type OR the admin flag', () => {
    const where = buildWhere({ vehicleType: HEAVY_DUTY_VEHICLE_TYPE })

    expect(where.vehicleType).toBeUndefined()
    expect(where.AND).toEqual([
      { OR: [{ vehicleType: HEAVY_DUTY_VEHICLE_TYPE }, { heavyEquipment: true }] },
    ])
  })

  it('keeps the union inside AND, so geography still narrows it', () => {
    // The failure this catches is specific and silent: an OR at the top level
    // would answer "trucks in Kotayk OR any heavy-equipment truck in the
    // country" — a regional page quietly listing the whole fleet.
    const where = buildWhere({ regionSlug: 'kotayk', vehicleType: HEAVY_DUTY_VEHICLE_TYPE })

    expect(Array.isArray(where.OR)).toBe(true)
    expect(Array.isArray(where.AND)).toBe(true)
    expect(JSON.stringify(where.OR)).not.toContain('heavyEquipment')
    expect(JSON.stringify(where.AND)).toContain('heavyEquipment')
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
