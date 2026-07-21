import type { LocationQuery } from 'vue-router'
import { CapacityOption, ServiceType, SortOption } from '~/types/enums'
import type { TowTruckFilterState } from '~/types/filters'
import { createDefaultFilterState } from './towTruckFilters'

/** Serializes filter state into URL query params (only non-default values) */
export function buildFilterQueryParams(
  filters: TowTruckFilterState,
): Record<string, string | undefined> {
  return {
    '24h': filters.works24Hours ? '1' : undefined,
    manipulator: filters.manipulator ? '1' : undefined,
    services: filters.services.length > 0 ? filters.services.join(',') : undefined,
    capacity: filters.capacity !== null ? String(filters.capacity) : undefined,
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
  if (parseQueryValue(query.manipulator) === '1') state.manipulator = true

  const services = parseQueryValue(query.services)
  if (services) {
    const validServices = new Set<string>(Object.values(ServiceType))
    state.services = services
      .split(',')
      .filter((service): service is ServiceType => validServices.has(service))
  }

  const capacity = Number(parseQueryValue(query.capacity)) as CapacityOption
  if ([CapacityOption.UpTo2, CapacityOption.UpTo5, CapacityOption.UpTo10].includes(capacity)) {
    state.capacity = capacity
  }

  const sort = parseQueryValue(query.sort)
  if (sort && Object.values(SortOption).includes(sort as SortOption)) {
    state.sort = sort as SortOption
  }

  return state
}
