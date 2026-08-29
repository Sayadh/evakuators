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
  /**
   * «2-հարկանի էվակուատոր» — carries two cars at once.
   *
   * A one-way narrowing like `works24Hours`, not a tri-state: false means "do
   * not care", never "must NOT be two-tier". Nobody searches for a truck that
   * definitely cannot carry a second car.
   */
  doubleDeck: boolean
  /**
   * «Ունի կցորդ» — can tow a second car. Same one-way-narrowing shape as
   * `doubleDeck` right above, for the same reason.
   */
  towHitch: boolean
  sort: SortOption
}
