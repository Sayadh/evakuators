import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import type { TowTruckFilters, TowTruckWhere } from '../src/tow-trucks/tow-truck.types'
import {
  HEAVY_DUTY_VEHICLE_TYPE,
  MANIPULATOR_VEHICLE_TYPE,
  SPECIALIST_VEHICLE_TYPES,
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

/**
 * The WHERE a repository method actually hands to Prisma.
 *
 * `buildWhere` above only covers `findManyCards`. The other general read paths
 * — coverage, featured, the nearest search's card fetch — each write their own
 * WHERE inline, which is precisely why they are the ones that can forget the
 * exclusion. Captured through a stub client rather than asserted as source
 * text, so a refactor that moves the clause somewhere else still passes.
 */
function capturedWhere(call: (repository: TowTrucksRepository) => unknown): TowTruckWhere {
  let captured: TowTruckWhere = {}
  const prisma = {
    towTruck: {
      findMany: (args: { where: TowTruckWhere }) => {
        captured = args.where
        return Promise.resolve([])
      },
    },
  }
  void call(new TowTrucksRepository(prisma as never))
  return captured
}

/** What every general listing must carry — see SPECIALIST_VEHICLE_TYPES */
const HIDDEN = { notIn: [MANIPULATOR_VEHICLE_TYPE, HEAVY_DUTY_VEHICLE_TYPE] }

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

  it('hides the specialist types when no type is asked for', () => {
    // A city page is general discovery: «Մանիպուլյատոր» and «Ծանր տեխնիկա» have
    // pages of their own and appear nowhere else. Before this, someone browsing
    // Աբովյան was offered a crane truck for a broken hatchback.
    const where = buildWhere({ citySlug: 'abovyan' })
    expect(where.vehicleType).toEqual(HIDDEN)
    expect(where.AND).toBeUndefined()
  })

  it('excludes by TYPE, never by the equipment flags', () => {
    // The distinction the whole rule rests on. A flatbed that ticked «Ունի
    // մանիպուլյատոր», or one an admin marked as heavy-equipment capable, is an
    // ordinary evacuator that ALSO does the specialist job — it stays in every
    // city listing. Excluding on the union would delete real supply.
    const serialised = JSON.stringify(buildWhere({ citySlug: 'abovyan' }))
    expect(serialised).not.toContain('manipulator\":')
    expect(serialised).not.toContain('heavyEquipment')
  })

  it('narrows the geography instead of joining it', () => {
    // Same trap as the vehicle-type filter itself: an exclusion pushed into
    // `or` would answer "trucks in Abovyan OR every non-specialist truck in the
    // country", i.e. the whole fleet on one town's page.
    const where = buildWhere({ citySlug: 'abovyan' })
    expect(JSON.stringify(where.OR)).not.toContain('notIn')
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

describe('the specialist types are landing-page-only', () => {
  /**
   * «Մանիպուլյատոր» and «Ծանր տեխնիկա» are listed on their own pages and
   * nowhere else. Everything below is invisible in a result list — the trucks
   * simply are or are not there — so it is asserted on the WHERE.
   */
  it('names both types and nothing else', () => {
    expect([...SPECIALIST_VEHICLE_TYPES]).toEqual([
      MANIPULATOR_VEHICLE_TYPE,
      HEAVY_DUTY_VEHICLE_TYPE,
    ])
  })

  it('is lifted by naming the type — both landing pages keep their union', () => {
    // The rule is about GENERAL discovery. An explicit `?vehicleType=` is not
    // general discovery, and if the exclusion applied there too both pages
    // would render empty — the loudest possible version of this bug, and the
    // reason it is the last branch in buildWhere rather than the first line.
    for (const type of [MANIPULATOR_VEHICLE_TYPE, HEAVY_DUTY_VEHICLE_TYPE]) {
      const where = buildWhere({ vehicleType: type })
      expect(where.vehicleType).toBeUndefined()
      expect(Array.isArray(where.AND)).toBe(true)
    }
  })

  it('still hides them from every other named type', () => {
    // Not by an extra clause — `vehicleType = 'flatbed'` already cannot match
    // a specialist truck. Asserted so a future refactor that replaces the
    // equality with something looser has to think about it.
    expect(buildWhere({ vehicleType: 'flatbed' }).vehicleType).toBe('flatbed')
  })

  it('hides them from the per-area counters', () => {
    // The counters have to count what the listing lists, or a «3 վարորդ» badge
    // opens a page with two — and the badge is what the visitor clicked.
    const where = capturedWhere((repository) => repository.findCoverage())
    expect(where.isActive).toBe(true)
    expect(where.vehicleType).toEqual(HIDDEN)
  })

  it('hides them from the homepage featured picks', () => {
    // An admin ticking `isFeatured` on a crane truck does not put it on the
    // homepage — the homepage is the most general listing there is.
    const where = capturedWhere((repository) => repository.findFeaturedCards())
    expect(where.isFeatured).toBe(true)
    expect(where.vehicleType).toEqual(HIDDEN)
  })

  it('hides them from the nearest-driver card fetch', () => {
    // Belt and braces: the PostGIS query already filters them before LIMIT (see
    // NearestRepository), and this states the rule again the way `isActive`
    // is stated again — every public read path in the repository says it.
    const where = capturedWhere((repository) => repository.findCardsByIds([1, 2]))
    expect(where.isActive).toBe(true)
    expect(where.vehicleType).toEqual(HIDDEN)
  })
})
