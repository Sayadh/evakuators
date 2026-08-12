import type { VehicleTypePage } from '~/constants/vehicleTypePages'
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

  /**
   * Two levels, not three: a vehicle-type page hangs directly off the home
   * page. There is no «Տեխնիկա» hub above it to link to, and inventing one as
   * an unlinked crumb would put a dead level in the trail and in the
   * BreadcrumbList schema.
   */
  const forVehicleType = (page: Pick<VehicleTypePage, 'heading'>): BreadcrumbItem[] => [
    HOME,
    { label: page.heading },
  ]

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

  /**
   * A road corridor sits under its marz exactly like a city does — same depth,
   * same trail. It takes plain values rather than a `ServiceZone` because the
   * region's display name is not on the zone record (it holds a `regionId`).
   */
  const forServiceZone = (
    regionName: string,
    regionSlug: string,
    zoneName: string,
  ): BreadcrumbItem[] => [
    HOME,
    { label: regionName, to: getRegionRoute(regionSlug) },
    { label: zoneName },
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

  return {
    forRegions,
    forFreeRoutes,
    forVehicleType,
    forRegion,
    forCity,
    forServiceZone,
    forYerevan,
    forDistrict,
    forTowTruck,
  }
}
