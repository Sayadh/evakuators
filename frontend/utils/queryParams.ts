import type { LocationQuery } from 'vue-router'
import { CAPACITY_RANGE_OPTIONS, GENERAL_LISTING_VEHICLE_TYPE_OPTIONS } from '~/constants/vehicles'
import { ServiceType, SortOption, type VehicleType } from '~/types/enums'
import type { TowTruckFilterState } from '~/types/filters'
import { createDefaultFilterState } from './towTruckFilters'

/** Serializes filter state into URL query params (only non-default values) */
export function buildFilterQueryParams(
  filters: TowTruckFilterState,
): Record<string, string | undefined> {
  return {
    '24h': filters.works24Hours ? '1' : undefined,
    vehicleType: filters.vehicleType ?? undefined,
    services: filters.services.length > 0 ? filters.services.join(',') : undefined,
    capacity: filters.capacity ?? undefined,
    sort: filters.sort !== SortOption.Recommended ? filters.sort : undefined,
  }
}

function parseQueryValue(value: LocationQuery[string]): string | undefined {
  if (Array.isArray(value)) return value[0] ?? undefined
  return value ?? undefined
}

/** Restores filter state from URL query params */
export function parseFilterQueryParams(query: LocationQuery): TowTruckFilterState {
  const state = createDefaultFilterState()

  if (parseQueryValue(query['24h']) === '1') state.works24Hours = true
  // `?manipulator=1` was a real query param before the filter checkbox was
  // removed (see docs/taxonomies.md § "Landing-page-only vehicle types") — an
  // old bookmark or shared link carrying it is simply ignored now, same as any
  // other unrecognised query key.

  // Validated against GENERAL_LISTING_VEHICLE_TYPE_OPTIONS, not the full
  // VehicleType enum: a URL carrying `?vehicleType=manipulator` (an old
  // /manipulator-style link, or someone editing it by hand) must not silently
  // select a specialist type that this filter never offers and every truck
  // list has already excluded.
  const vehicleType = parseQueryValue(query.vehicleType)
  if (
    vehicleType &&
    GENERAL_LISTING_VEHICLE_TYPE_OPTIONS.some((option) => option.value === vehicleType)
  ) {
    state.vehicleType = vehicleType as VehicleType
  }

  const services = parseQueryValue(query.services)
  if (services) {
    const validServices = new Set<string>(Object.values(ServiceType))
    state.services = services
      .split(',')
      .filter((service): service is ServiceType => validServices.has(service))
  }

  const capacity = parseQueryValue(query.capacity)
  if (capacity && CAPACITY_RANGE_OPTIONS.some((option) => option.value === capacity)) {
    state.capacity = capacity
  }

  const sort = parseQueryValue(query.sort)
  if (sort && Object.values(SortOption).includes(sort as SortOption)) {
    state.sort = sort as SortOption
  }

  return state
}
