import type { ServiceType, SortOption, VehicleType } from './enums'

export interface TowTruckFilterState {
  works24Hours: boolean
  services: ServiceType[]
  /**
   * GENERAL_LISTING_VEHICLE_TYPE_OPTIONS value (~/constants/vehicles), or
   * null for "any". Never a specialist type — see that constant for why.
   */
  vehicleType: VehicleType | null
  /** CAPACITY_RANGE_OPTIONS value slug (~/constants/vehicles), or null for "any" */
  capacity: string | null
  sort: SortOption
}
