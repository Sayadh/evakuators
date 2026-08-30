import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { asksWheelSkates } from '~/constants/vehicles'
import { SortOption, VehicleType } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import type { TowTruckFilterState } from '~/types/filters'
import {
  countActiveFilters,
  createDefaultFilterState,
  matchesFilters,
} from '~/utils/towTruckFilters'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'

/**
 * «Առկա են անիվային ռոլիկներ» — wheel skates, for loading a vehicle whose
 * wheels are locked or will not turn.
 *
 * The driver-answered boolean (`wheelSkates`) and its gating predicate
 * (`asksWheelSkates`) already exist — see `tests/specialistProfile.spec.ts`
 * for the registration-form-clearing behaviour. This file pins the same two
 * things `doubleDeck.spec.ts`/`towHitch.spec.ts` pin for their filters: the
 * one-way narrowing (what the filter does when ticked and when not) and that
 * the answer survives a round trip through the URL.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function card(wheelSkates: boolean, type: string = VehicleType.Flatbed): TowTruckCard {
  return {
    id: 1,
    slug: 'truck',
    driverName: 'Վարորդ',
    phone: '+37491000001',
    works24Hours: false,
    vehicle: {
      brand: 'Isuzu',
      model: 'NPR',
      type,
      capacityTons: 3,
      manipulator: false,
      wheelSkates,
      doubleDeck: false,
      towHitch: false,
    },
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
    expect(asksWheelSkates(VehicleType.Flatbed)).toBe(true)
    expect(asksWheelSkates(VehicleType.SlidingPlatform)).toBe(true)
  })

  it('does not ask a manipulator or a machinery transporter', () => {
    // A crane lifts by cable and a transporter is driven or winched onto a
    // low deck — neither ever touches a skate, and a stray tick would
    // publish it.
    expect(asksWheelSkates(VehicleType.Manipulator)).toBe(false)
    expect(asksWheelSkates(VehicleType.HeavyDuty)).toBe(false)
  })
})

describe('the filter narrows one way only', () => {
  it('is off by default, so a fresh listing hides nobody', () => {
    expect(createDefaultFilterState().wheelSkates).toBe(false)
    expect(matchesFilters(card(false), filters())).toBe(true)
    expect(matchesFilters(card(true), filters())).toBe(true)
  })

  it('ticked, keeps only trucks with wheel skates', () => {
    expect(matchesFilters(card(true), filters({ wheelSkates: true }))).toBe(true)
    expect(matchesFilters(card(false), filters({ wheelSkates: true }))).toBe(false)
  })

  it('unticked never EXCLUDES a truck with wheel skates', () => {
    // Nobody searches for a truck that definitely has none, so this is a
    // narrowing and not a tri-state — same as «Աշխատում է 24/7».
    expect(matchesFilters(card(true), filters({ wheelSkates: false }))).toBe(true)
  })

  it('counts towards the "clear filters" badge only when on', () => {
    expect(countActiveFilters(filters())).toBe(0)
    expect(countActiveFilters(filters({ wheelSkates: true }))).toBe(1)
  })

  it('does not disturb the sort, which is not a filter', () => {
    expect(countActiveFilters(filters({ sort: SortOption.Price }))).toBe(0)
  })

  it('narrows independently of doubleDeck and towHitch — three different questions', () => {
    expect(matchesFilters(card(true), filters({ doubleDeck: true }))).toBe(false)
    expect(matchesFilters(card(true), filters({ wheelSkates: true }))).toBe(true)
  })
})

describe('the filter survives the URL', () => {
  it('is emitted only when on', () => {
    expect(buildFilterQueryParams(filters()).wheelSkates).toBeUndefined()
    expect(buildFilterQueryParams(filters({ wheelSkates: true })).wheelSkates).toBe('1')
  })

  it('round-trips', () => {
    expect(parseFilterQueryParams({ wheelSkates: '1' }).wheelSkates).toBe(true)
  })

  it('treats anything other than "1" as off, including "0"', () => {
    expect(parseFilterQueryParams({}).wheelSkates).toBe(false)
    expect(parseFilterQueryParams({ wheelSkates: '0' }).wheelSkates).toBe(false)
    expect(parseFilterQueryParams({ wheelSkates: 'true' }).wheelSkates).toBe(false)
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

    for (const emitted of Object.keys(buildFilterQueryParams(filters({ wheelSkates: true })))) {
      expect(keys, `query key ${emitted}`).toContain(`'${emitted}'`)
    }
  })
})

describe('the card shape carries what the filter needs', () => {
  it('the filter sidebar checkbox exists and reads/writes the store field', () => {
    const component = readFileSync(
      `${ROOT}components/filters/TowTruckFilters.vue`,
      'utf8',
    )
    expect(component).toContain('store.wheelSkates')
    expect(component).toContain('store.toggleWheelSkates()')
    expect(component).toContain('Առկա են անիվային ռոլիկներ')
  })
})
