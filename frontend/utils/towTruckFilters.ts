import { matchesCapacityRange } from '~/constants/vehicles'
import { SortOption } from '~/types/enums'
import type { TowTruck } from '~/types/towTruck'
import type { TowTruckFilterState } from '~/types/filters'

export function createDefaultFilterState(): TowTruckFilterState {
  return {
    works24Hours: false,
    manipulator: false,
    services: [],
    capacity: null,
    sort: SortOption.Recommended,
  }
}

export function matchesFilters(truck: TowTruck, filters: TowTruckFilterState): boolean {
  if (filters.works24Hours && !truck.works24Hours) return false
  if (filters.manipulator && !truck.vehicle.manipulator) return false
  if (filters.capacity !== null && !matchesCapacityRange(truck.vehicle.capacityTons, filters.capacity))
    return false
  if (filters.services.length > 0) {
    const hasAll = filters.services.every((service) => truck.services.includes(service))
    if (!hasAll) return false
  }
  return true
}

/** "Recommended" score: 24/7 services first */
function getRecommendedScore(truck: TowTruck): number {
  return truck.works24Hours ? 1 : 0
}

export function sortTowTrucks(trucks: TowTruck[], sort: SortOption): TowTruck[] {
  const sorted = [...trucks]
  switch (sort) {
    case SortOption.Price:
      // Trucks without a price go to the end
      return sorted.sort(
        (a, b) => (a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity),
      )
    case SortOption.Recommended:
    default:
      return sorted.sort((a, b) => getRecommendedScore(b) - getRecommendedScore(a))
  }
}

export function applyTowTruckFilters(
  trucks: TowTruck[],
  filters: TowTruckFilterState,
): TowTruck[] {
  return sortTowTrucks(
    trucks.filter((truck) => matchesFilters(truck, filters)),
    filters.sort,
  )
}

export function countActiveFilters(filters: TowTruckFilterState): number {
  let count = filters.services.length
  if (filters.works24Hours) count += 1
  if (filters.manipulator) count += 1
  if (filters.capacity !== null) count += 1
  return count
}
