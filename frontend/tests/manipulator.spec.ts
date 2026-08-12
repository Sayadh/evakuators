import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasManipulator } from '~/constants/vehicles'
import { SortOption, VehicleType } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import { createDefaultFilterState, matchesFilters } from '~/utils/towTruckFilters'

/**
 * «Մանիպուլյատոր» — one question the registration form asks twice.
 *
 * `type: 'manipulator'` (a required single-choice select) and `manipulator:
 * true` (an optional equipment checkbox) are both legitimate answers, and the
 * filter used to read only the second. A driver who answered with the first —
 * which is the natural way to answer when the whole truck IS a manipulator —
 * did not appear under the filter built for exactly that customer.
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

describe('the filter', () => {
  function truck(type: string, manipulator: boolean): TowTruckCard {
    return {
      id: 1,
      slug: 'truck',
      driverName: 'Վարորդ',
      phone: '+37491000001',
      works24Hours: false,
      vehicle: { brand: 'Isuzu', model: 'NPR', type, capacityTons: 3, manipulator },
      services: [],
      serviceAreas: [],
      location: { name: 'Հիմք' },
      images: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as TowTruckCard
  }

  const manipulatorOnly = { ...createDefaultFilterState(), manipulator: true }

  it('keeps a driver who answered only with the vehicle type', () => {
    expect(matchesFilters(truck(VehicleType.Manipulator, false), manipulatorOnly)).toBe(true)
  })

  it('keeps a flatbed that also carries a crane', () => {
    // Not a data error — a real vehicle, and the checkbox is the only way to
    // say so once the type is spent on «Հարթակով էվակուատոր».
    expect(matchesFilters(truck(VehicleType.Flatbed, true), manipulatorOnly)).toBe(true)
  })

  it('drops a driver with neither', () => {
    expect(matchesFilters(truck(VehicleType.Flatbed, false), manipulatorOnly)).toBe(false)
  })

  it('lets everyone through when the box is not ticked', () => {
    const off = createDefaultFilterState()
    expect(off.sort).toBe(SortOption.Recommended)
    expect(matchesFilters(truck(VehicleType.Flatbed, false), off)).toBe(true)
  })
})

describe('the profile page cannot contradict the filter', () => {
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
