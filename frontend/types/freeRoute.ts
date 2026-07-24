export interface FreeRouteDriver {
  slug: string
  name: string
  phone: string
  /** VehicleType slug — see ~/types/enums */
  vehicleType: string
}

/** Public shape — a card on the "Ազատ երթուղիներ" listing page */
export interface FreeRoute {
  id: number
  startRegionSlug: string
  startCitySlug: string
  endRegionSlug: string
  endCitySlug: string
  /** ISO datetime */
  departureAt: string
  description?: string
  driver: FreeRouteDriver
}

export type FreeRouteStatus = 'ACTIVE' | 'FINISHED'

/** Driver's own dashboard shape — includes status, no need for their own driver info */
export interface MyFreeRoute {
  id: number
  startRegionSlug: string
  startCitySlug: string
  endRegionSlug: string
  endCitySlug: string
  departureAt: string
  description?: string
  status: FreeRouteStatus
  createdAt: string
}
