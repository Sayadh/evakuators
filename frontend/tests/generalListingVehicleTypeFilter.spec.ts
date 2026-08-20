import { describe, expect, it } from 'vitest'
import {
  GENERAL_LISTING_VEHICLE_TYPE_OPTIONS,
  SPECIALIST_VEHICLE_TYPES,
  VEHICLE_TYPE_OPTIONS,
} from '~/constants/vehicles'
import { VehicleType } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import {
  countActiveFilters,
  createDefaultFilterState,
  matchesFilters,
} from '~/utils/towTruckFilters'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'

/**
 * The «Տեխնիկա» section of the public listing filter — city, marz and
 * Yerevan pages — after it stopped being the «Ունի մանիպուլյատոր» checkbox
 * (`manipulator.spec.ts`) and became a plain vehicle-type picker.
 *
 * The one property that matters and is easy to lose in a future edit: this
 * filter can never select a specialist type, because every truck it runs over
 * has already had those types excluded server-side (or in mock mode) — see
 * `specialistVehicleTypes.spec.ts`. Offering one here would be a checkbox that
 * always shows zero results.
 */

function truck(type: string): TowTruckCard {
  return {
    id: 1,
    slug: 'truck',
    driverName: 'Վարորդ',
    phone: '+37491000001',
    works24Hours: false,
    vehicle: { brand: 'Isuzu', model: 'NPR', type, capacityTons: 3, manipulator: false },
    services: [],
    serviceAreas: [],
    location: { name: 'Հիմք' },
    images: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as TowTruckCard
}

describe('GENERAL_LISTING_VEHICLE_TYPE_OPTIONS', () => {
  it('is every vehicle type except the specialist ones', () => {
    expect(GENERAL_LISTING_VEHICLE_TYPE_OPTIONS.map((option) => option.value).sort()).toEqual(
      VEHICLE_TYPE_OPTIONS.map((option) => option.value)
        .filter((value) => !(SPECIALIST_VEHICLE_TYPES as string[]).includes(value))
        .sort(),
    )
  })

  it('never offers a specialist type', () => {
    for (const type of SPECIALIST_VEHICLE_TYPES) {
      expect(GENERAL_LISTING_VEHICLE_TYPE_OPTIONS.some((option) => option.value === type)).toBe(
        false,
      )
    }
  })

  it('offers the two ordinary types today', () => {
    expect(GENERAL_LISTING_VEHICLE_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      VehicleType.Flatbed,
      VehicleType.SlidingPlatform,
    ])
  })
})

describe('matchesFilters — vehicleType', () => {
  it('matches by plain equality, no union', () => {
    const flatbedOnly = { ...createDefaultFilterState(), vehicleType: VehicleType.Flatbed }
    expect(matchesFilters(truck(VehicleType.Flatbed), flatbedOnly)).toBe(true)
    expect(matchesFilters(truck(VehicleType.SlidingPlatform), flatbedOnly)).toBe(false)
  })

  it('lets everyone through when nothing is picked', () => {
    const off = createDefaultFilterState()
    expect(off.vehicleType).toBeNull()
    expect(matchesFilters(truck(VehicleType.Flatbed), off)).toBe(true)
    expect(matchesFilters(truck(VehicleType.SlidingPlatform), off)).toBe(true)
  })

  it('is counted as an active filter', () => {
    const off = createDefaultFilterState()
    const on = { ...off, vehicleType: VehicleType.Flatbed }
    expect(countActiveFilters(off)).toBe(0)
    expect(countActiveFilters(on)).toBe(1)
  })
})

describe('the URL round trip', () => {
  it('serialises the picked type', () => {
    const state = { ...createDefaultFilterState(), vehicleType: VehicleType.SlidingPlatform }
    expect(buildFilterQueryParams(state).vehicleType).toBe(VehicleType.SlidingPlatform)
  })

  it('omits the key when nothing is picked', () => {
    expect(buildFilterQueryParams(createDefaultFilterState()).vehicleType).toBeUndefined()
  })

  it('restores an ordinary type from the query', () => {
    const state = parseFilterQueryParams({ vehicleType: VehicleType.Flatbed })
    expect(state.vehicleType).toBe(VehicleType.Flatbed)
  })

  it('refuses to restore a specialist type from a hand-edited or stale URL', () => {
    // The clearest way this filter can go wrong: an old `/manipulator`-style
    // link, or someone typing `?vehicleType=manipulator` on a city page,
    // silently selecting a type this filter never offers and no truck in the
    // array can ever match.
    for (const type of SPECIALIST_VEHICLE_TYPES) {
      const state = parseFilterQueryParams({ vehicleType: type })
      expect(state.vehicleType).toBeNull()
    }
  })

  it('ignores an unrecognised value the same way', () => {
    const state = parseFilterQueryParams({ vehicleType: 'no-such-type' })
    expect(state.vehicleType).toBeNull()
  })
})
