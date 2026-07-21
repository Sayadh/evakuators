import type { TowTruckLocation } from '~/types/towTruck'

export const getHomeRoute = (): string => '/'
export const getRegionsRoute = (): string => '/regions'
export const getRegionRoute = (regionSlug: string): string => `/regions/${regionSlug}`
export const getCityRoute = (regionSlug: string, citySlug: string): string =>
  `/regions/${regionSlug}/${citySlug}`
export const getYerevanRoute = (): string => '/yerevan'
export const getDistrictRoute = (districtSlug: string): string => `/yerevan/${districtSlug}`
export const getTowTruckRoute = (towTruckSlug: string): string => `/tow-trucks/${towTruckSlug}`
export const getRegisterRoute = (): string => '/register'

/** Route to the listing page a tow truck belongs to (city or Yerevan district) */
export function getTowTruckLocationRoute(location: TowTruckLocation): string {
  if (location.districtSlug) return getDistrictRoute(location.districtSlug)
  if (location.regionSlug && location.citySlug)
    return getCityRoute(location.regionSlug, location.citySlug)
  return getRegionsRoute()
}
