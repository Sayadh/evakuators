import type { CapacityOption, ServiceType, SortOption } from './enums'

export interface TowTruckFilterState {
  works24Hours: boolean
  manipulator: boolean
  services: ServiceType[]
  capacity: CapacityOption | null
  sort: SortOption
}
