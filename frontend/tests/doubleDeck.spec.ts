import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { asksDoubleDeck } from '~/constants/vehicles'
import { SortOption, VehicleType } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import type { TowTruckFilterState } from '~/types/filters'
import {
  countActiveFilters,
  createDefaultFilterState,
  matchesFilters,
} from '~/utils/towTruckFilters'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'
import { createRegistrationFormState, syncVehicleDependentFields } from '~/utils/registrationForm'

/**
 * «2-հարկանի էվակուատոր» — a two-tier platform that carries two cars at once.
 *
 * A driver-answered equipment boolean (the `wheelSkates` shape), surfaced as a
 * public filter checkbox. The three things worth pinning are the gating (who
 * is even asked), the one-way narrowing (what the filter does when ticked and
 * when not), and that the answer survives a round trip through the URL.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function card(doubleDeck: boolean, type: string = VehicleType.Flatbed): TowTruckCard {
  return {
    id: 1,
    slug: 'truck',
    driverName: 'Վարորդ',
    phone: '+37491000001',
    works24Hours: false,
    vehicle: { brand: 'Isuzu', model: 'NPR', type, capacityTons: 3, manipulator: false, doubleDeck },
    services: [],
    serviceAreas: [],
    location: { name: 'Հիմք' },
  } as unknown as TowTruckCard
}

function filters(overrides: Partial<TowTruckFilterState> = {}): TowTruckFilterState {
  return { ...createDefaultFilterState(), ...overrides }
}

describe('who is asked the question at all', () => {
  it('asks the two ordinary evacuators', () => {
    expect(asksDoubleDeck(VehicleType.Flatbed)).toBe(true)
    expect(asksDoubleDeck(VehicleType.SlidingPlatform)).toBe(true)
  })

  it('does not ask a manipulator or a machinery transporter', () => {
    // A crane lifts one vehicle and a transporter carries one machine — there
    // is no second deck to claim, and a stray tick would publish one.
    expect(asksDoubleDeck(VehicleType.Manipulator)).toBe(false)
    expect(asksDoubleDeck(VehicleType.HeavyDuty)).toBe(false)
  })

  it('clears an answer that stops being asked when the type changes', () => {
    // The failure this prevents: a flatbed ticks the box, then switches to
    // «Մանիպուլյատոր». The checkbox disappears, so the `true` is invisible and
    // uncorrectable — and still reaches the public profile.
    const form = { ...createRegistrationFormState(), vehicleType: VehicleType.Flatbed }
    form.doubleDeck = true

    syncVehicleDependentFields(form)
    expect(form.doubleDeck).toBe(true)

    form.vehicleType = VehicleType.Manipulator
    syncVehicleDependentFields(form)
    expect(form.doubleDeck).toBe(false)
  })
})

describe('the filter narrows one way only', () => {
  it('is off by default, so a fresh listing hides nobody', () => {
    expect(createDefaultFilterState().doubleDeck).toBe(false)
    expect(matchesFilters(card(false), filters())).toBe(true)
    expect(matchesFilters(card(true), filters())).toBe(true)
  })

  it('ticked, keeps only two-tier trucks', () => {
    expect(matchesFilters(card(true), filters({ doubleDeck: true }))).toBe(true)
    expect(matchesFilters(card(false), filters({ doubleDeck: true }))).toBe(false)
  })

  it('unticked never EXCLUDES a two-tier truck', () => {
    // Nobody searches for a truck that definitely cannot carry a second car,
    // so this is a narrowing and not a tri-state — same as «Աշխատում է 24/7».
    expect(matchesFilters(card(true), filters({ doubleDeck: false }))).toBe(true)
  })

  it('counts towards the "clear filters" badge only when on', () => {
    expect(countActiveFilters(filters())).toBe(0)
    expect(countActiveFilters(filters({ doubleDeck: true }))).toBe(1)
  })

  it('does not disturb the sort, which is not a filter', () => {
    expect(countActiveFilters(filters({ sort: SortOption.Price }))).toBe(0)
  })
})

describe('the filter survives the URL', () => {
  it('is emitted only when on', () => {
    expect(buildFilterQueryParams(filters()).doubleDeck).toBeUndefined()
    expect(buildFilterQueryParams(filters({ doubleDeck: true })).doubleDeck).toBe('1')
  })

  it('round-trips', () => {
    expect(parseFilterQueryParams({ doubleDeck: '1' }).doubleDeck).toBe(true)
  })

  it('treats anything other than "1" as off, including "0"', () => {
    expect(parseFilterQueryParams({}).doubleDeck).toBe(false)
    expect(parseFilterQueryParams({ doubleDeck: '0' }).doubleDeck).toBe(false)
    expect(parseFilterQueryParams({ doubleDeck: 'true' }).doubleDeck).toBe(false)
  })

  it('is stripped from the URL when turned off', () => {
    // `FILTER_QUERY_KEYS` is what removes a param whose filter is now off. A
    // key missing from it can never be cleared from a shared link — the state
    // says off, the URL still says on, and a reload turns it back on.
    const composable = readFileSync(`${ROOT}composables/useTowTruckFilters.ts`, 'utf8')
    const keys = composable.slice(
      composable.indexOf('FILTER_QUERY_KEYS = ['),
      composable.indexOf(']', composable.indexOf('FILTER_QUERY_KEYS = [')),
    )

    for (const emitted of Object.keys(buildFilterQueryParams(filters({ doubleDeck: true })))) {
      expect(keys, `query key ${emitted}`).toContain(`'${emitted}'`)
    }
  })
})

describe('the profile row is shown to exactly the drivers who were asked', () => {
  it('renders the row behind the same predicate the form gates on', () => {
    // Rendering is not testable here (docs/testing.md — no component runtime),
    // so this pins that the row and the question cannot come apart: showing
    // «2-հարկանի էվակուատոր՝ Ոչ» on a crane truck states an absence nobody
    // claimed, about a deck the job has no use for.
    const info = readFileSync(`${ROOT}components/tow-truck/TowTruckInfo.vue`, 'utf8')
    expect(info).toContain('asksDoubleDeck(vehicle.type)')
    expect(info).toContain('vehicle.doubleDeck')
  })
})
