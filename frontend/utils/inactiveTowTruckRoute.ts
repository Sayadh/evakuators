import { VEHICLE_TYPE_PAGE_LIST } from '~/constants/vehicleTypePages'
import type { TowTruckInactivePlacement } from '~/types/towTruck'
import {
  getCityRoute,
  getDistrictRoute,
  getRegionRoute,
  getRegionsRoute,
  getVehicleTypePageRoute,
} from '~/utils/routeHelpers'

/**
 * The listing that replaces a deactivated driver's profile.
 *
 * Specialist trucks go to their own landing page, because general area listings
 * never show those vehicle types. A corridor base has no city, so it falls back
 * to the marz.
 */
export function getInactiveTowTruckRoute(placement: TowTruckInactivePlacement): string {
  const specialistPage = VEHICLE_TYPE_PAGE_LIST.find(
    (page) => page.vehicleType === placement.vehicleType,
  )
  if (specialistPage) return getVehicleTypePageRoute(specialistPage.slug)

  if (placement.districtSlug) return getDistrictRoute(placement.districtSlug)
  if (placement.regionSlug && placement.citySlug) {
    return getCityRoute(placement.regionSlug, placement.citySlug)
  }
  if (placement.regionSlug) return getRegionRoute(placement.regionSlug)
  return getRegionsRoute()
}
