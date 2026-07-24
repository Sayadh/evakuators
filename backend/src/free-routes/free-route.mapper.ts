import type { FreeRoute } from '@prisma/client'
import type { FreeRouteApi, FreeRouteWithTruck, MyFreeRouteApi } from './free-route.types'

/** DB row (+ joined driver) → public API shape */
export function toFreeRouteApi(route: FreeRouteWithTruck): FreeRouteApi {
  return {
    id: route.id,
    startRegionSlug: route.startRegionSlug,
    startCitySlug: route.startCitySlug,
    endRegionSlug: route.endRegionSlug,
    endCitySlug: route.endCitySlug,
    departureAt: route.departureAt.toISOString(),
    description: route.description ?? undefined,
    driver: {
      slug: route.towTruck.slug,
      name: route.towTruck.companyName || route.towTruck.driverName,
      phone: route.towTruck.phone,
      vehicleType: route.towTruck.vehicleType,
    },
  }
}

/** DB row → driver's own dashboard shape (no need for the joined driver info — it's their own) */
export function toMyFreeRouteApi(route: FreeRoute): MyFreeRouteApi {
  return {
    id: route.id,
    startRegionSlug: route.startRegionSlug,
    startCitySlug: route.startCitySlug,
    endRegionSlug: route.endRegionSlug,
    endCitySlug: route.endCitySlug,
    departureAt: route.departureAt.toISOString(),
    description: route.description ?? undefined,
    status: route.status,
    createdAt: route.createdAt.toISOString(),
  }
}
