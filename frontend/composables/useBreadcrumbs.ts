import type { BreadcrumbItem } from '~/types/common'
import type { CityWithStats, District, Region } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'
import {
  getCityRoute,
  getDistrictRoute,
  getRegionRoute,
  getRegionsRoute,
  getYerevanRoute,
} from '~/utils/routeHelpers'

const HOME: BreadcrumbItem = { label: 'Գլխավոր', to: '/' }
const YEREVAN: BreadcrumbItem = { label: 'Երևան', to: getYerevanRoute() }

/** Breadcrumb trail builders for every page type */
export function useBreadcrumbs() {
  const forRegions = (): BreadcrumbItem[] => [HOME, { label: 'Մարզեր' }]

  const forFreeRoutes = (): BreadcrumbItem[] => [HOME, { label: 'Ազատ երթուղիներ' }]

  const forRegion = (region: Pick<Region, 'name'>): BreadcrumbItem[] => [
    HOME,
    { label: 'Մարզեր', to: getRegionsRoute() },
    { label: region.name },
  ]

  const forCity = (city: CityWithStats): BreadcrumbItem[] => [
    HOME,
    { label: city.regionName, to: getRegionRoute(city.regionSlug) },
    { label: city.name },
  ]

  const forYerevan = (): BreadcrumbItem[] => [HOME, { label: 'Երևան' }]

  const forDistrict = (district: Pick<District, 'name'>): BreadcrumbItem[] => [
    HOME,
    YEREVAN,
    { label: district.name },
  ]

  const forTowTruck = (truck: TowTruck, regionName?: string): BreadcrumbItem[] => {
    const trail: BreadcrumbItem[] = [HOME]
    const { location } = truck

    if (location.districtSlug) {
      trail.push(YEREVAN, { label: location.name, to: getDistrictRoute(location.districtSlug) })
    } else if (location.regionSlug && location.citySlug) {
      if (regionName) trail.push({ label: regionName, to: getRegionRoute(location.regionSlug) })
      trail.push({
        label: location.name,
        to: getCityRoute(location.regionSlug, location.citySlug),
      })
    }

    trail.push({ label: truck.companyName ?? truck.driverName })
    return trail
  }

  return { forRegions, forFreeRoutes, forRegion, forCity, forYerevan, forDistrict, forTowTruck }
}
