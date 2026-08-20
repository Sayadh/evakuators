import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasManipulator } from '~/constants/vehicles'
import { VehicleType } from '~/types/enums'

/**
 * «Մանիպուլյատոր» — one question the registration form asks twice.
 *
 * `type: 'manipulator'` (a required single-choice select) and `manipulator:
 * true` (an optional equipment checkbox) are both legitimate answers.
 * `hasManipulator` is the union of the two, and every place that renders the
 * answer goes through it — the profile page's own «Մանիպուլյատոր» row
 * (`TowTruckInfo.vue`) and, on the landing-page side, the mock-mode branch of
 * `getByVehicleType` in `towTrucks.service.ts`.
 *
 * There used to be a third consumer — the public filter sidebar's «Ունի
 * մանիպուլյատոր» checkbox — removed once both landing pages existed and made
 * it redundant, and replaced by a plain (non-union) vehicle-type picker; see
 * `tests/generalListingVehicleTypeFilter.spec.ts` and `docs/taxonomies.md`
 * § "Landing-page-only vehicle types".
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function vehicle(type: string, manipulator: boolean) {
  return { type, manipulator }
}

describe('hasManipulator', () => {
  it('is true when the driver ticked the checkbox', () => {
    expect(hasManipulator(vehicle(VehicleType.Flatbed, true))).toBe(true)
  })

  it('is true when the driver picked the manipulator vehicle type', () => {
    // The case that was silently excluded. Picking this type is a complete
    // answer; the checkbox is a redundant second ask for that driver.
    expect(hasManipulator(vehicle(VehicleType.Manipulator, false))).toBe(true)
  })

  it('is true when both agree', () => {
    expect(hasManipulator(vehicle(VehicleType.Manipulator, true))).toBe(true)
  })

  it('is false only when neither says so', () => {
    expect(hasManipulator(vehicle(VehicleType.Flatbed, false))).toBe(false)
    expect(hasManipulator(vehicle(VehicleType.SlidingPlatform, false))).toBe(false)
    expect(hasManipulator(vehicle(VehicleType.HeavyDuty, false))).toBe(false)
  })

  it('does not treat some other type as a manipulator', () => {
    // Guards against the predicate degrading into "any type at all is enough".
    expect(hasManipulator(vehicle('crane', false))).toBe(false)
  })
})

describe('the public filter no longer reads the union', () => {
  /**
   * Regression guard for the removal. `TowTruckFilterState.manipulator` (and
   * the store action, and the old single-purpose checkbox) must not come
   * back — the sidebar's «Տեխնիկա» section now filters by plain type equality
   * instead, covered in `tests/generalListingVehicleTypeFilter.spec.ts`.
   */
  const filterTypes = readFileSync(`${ROOT}types/filters.ts`, 'utf8')
  const filterUtils = readFileSync(`${ROOT}utils/towTruckFilters.ts`, 'utf8')

  it('has no manipulator field on the filter state', () => {
    expect(filterTypes).not.toContain('manipulator')
  })

  it('does not call hasManipulator from the filter predicate', () => {
    expect(filterUtils).not.toContain('hasManipulator')
  })
})

describe('the profile page still renders the union correctly', () => {
  /**
   * The visible half of the bug: the filter returned a truck and the truck's
   * own «Մանիպուլյատոր» row then said «Ոչ», because the two read different
   * fields. Asserted as text — the component is not mounted here (no
   * component-testing setup in this project, see docs/testing.md), so this
   * checks that it goes through the shared predicate rather than the raw
   * boolean.
   */
  const source = readFileSync(`${ROOT}components/tow-truck/TowTruckInfo.vue`, 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('renders the row from hasManipulator', () => {
    expect(code).toContain('hasManipulator(vehicle)')
  })

  it('does not read the raw boolean for that row', () => {
    expect(code).not.toContain('vehicle.manipulator ?')
  })
})

describe('the two copies of the rule', () => {
  /**
   * No shared code between the projects (CLAUDE.md), so the slug and the
   * derivation exist twice. This reads the backend file as text — the same
   * technique `serviceAreaLimits.spec.ts` and `repositoryAuthHeaders.spec.ts`
   * use — so the two cannot silently disagree.
   */
  const backend = readFileSync(
    `${ROOT}../backend/src/tow-trucks/vehicle-types.ts`,
    'utf8',
  )

  it('agrees on the slug', () => {
    expect(backend).toContain(`MANIPULATOR_VEHICLE_TYPE = '${VehicleType.Manipulator}'`)
  })

  it('agrees that either answer is enough', () => {
    // Both sides are a union, not an intersection. If one were changed to `&&`
    // the filter and the stored column would disagree for every driver who
    // answered one way.
    expect(backend).toContain('manipulator || vehicleType === MANIPULATOR_VEHICLE_TYPE')
  })
})
