import type { ServiceType, SortOption } from './enums'

export interface TowTruckFilterState {
  works24Hours: boolean
  manipulator: boolean
  services: ServiceType[]
  /** CAPACITY_RANGE_OPTIONS value slug (~/constants/vehicles), or null for "any" */
  capacity: string | null
  sort: SortOption
}
