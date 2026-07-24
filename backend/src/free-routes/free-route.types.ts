import type { FreeRoute, FreeRouteStatus } from '@prisma/client'

/** Minimal driver info needed to render a public free-route card */
export interface FreeRouteDriverInfo {
  slug: string
  driverName: string
  companyName: string | null
  phone: string
  /** VehicleType slug from frontend constants */
  vehicleType: string
}

export type FreeRouteWithTruck = FreeRoute & { towTruck: FreeRouteDriverInfo }

/** Public API shape — anonymous customers browsing /free-routes */
export interface FreeRouteApi {
  id: number
  startRegionSlug: string
  startCitySlug: string
  endRegionSlug: string
  endCitySlug: string
  departureAt: string
  description?: string
  driver: {
    slug: string
    name: string
    phone: string
    vehicleType: string
  }
}

/** Driver-facing shape — their own routes in any status, for the dashboard */
export interface MyFreeRouteApi {
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
