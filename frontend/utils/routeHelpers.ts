import type { TowTruckLocation } from '~/types/towTruck'

export const getHomeRoute = (): string => '/'
export const getRegionsRoute = (): string => '/regions'
export const getRegionRoute = (regionSlug: string): string => `/regions/${regionSlug}`
export const getCityRoute = (regionSlug: string, citySlug: string): string =>
  `/regions/${regionSlug}/${citySlug}`
export const getYerevanRoute = (): string => '/yerevan'
export const getDistrictRoute = (districtSlug: string): string => `/yerevan/${districtSlug}`
export const getTowTruckRoute = (towTruckSlug: string): string => `/tow-trucks/${towTruckSlug}`
/**
 * A vehicle-type landing page (`/manipulator`, `/tsanr-tehnika`).
 *
 * The slug comes from `VEHICLE_TYPE_PAGES` — these are top-level URLs with no
 * shared prefix, so this helper is what keeps the leading slash and the shape
 * in one place rather than scattered through templates.
 */
export const getVehicleTypePageRoute = (pageSlug: string): string => `/${pageSlug}`
export const getRegisterRoute = (): string => '/register'

/** Route to the listing page a tow truck belongs to (city or Yerevan district) */
export function getTowTruckLocationRoute(location: TowTruckLocation): string {
  if (location.districtSlug) return getDistrictRoute(location.districtSlug)
  if (location.regionSlug && location.citySlug)
    return getCityRoute(location.regionSlug, location.citySlug)
  return getRegionsRoute()
}
