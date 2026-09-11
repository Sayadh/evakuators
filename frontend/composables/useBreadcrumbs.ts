import type { VehicleTypeGeo, VehicleTypePage } from '~/constants/vehicleTypePages'
import type { BreadcrumbItem } from '~/types/common'
import type { CityWithStats, District, Region } from '~/types/location'
import type { TowTruck } from '~/types/towTruck'
import {
  getCityRoute,
  getDistrictRoute,
  getRegionRoute,
  getRegionsRoute,
  getVehicleTypePageRoute,
  getYerevanRoute,
} from '~/utils/routeHelpers'

/**
 * Breadcrumb trail builders for every page type.
 *
 * The fixed crumbs («Գլխավոր», «Մարզեր», «Երևան») and the place names are both
 * translated here rather than by the pages: a trail is the one piece of UI that
 * appears on every geography page and is built in one place, so translating it
 * here is the difference between three files changed and thirty.
 *
 * Place names take a slug as well as a name — the slug is what
 * `i18n/placeNames.ts` is keyed by, and the Armenian name is the fallback for
 * anything it does not know (a settlement, mostly). See that file.
 */
export function useBreadcrumbs() {
  const { t } = useI18n()
  const placeName = usePlaceName()

  const HOME: BreadcrumbItem = { label: t('breadcrumb.home'), to: '/' }
  const YEREVAN: BreadcrumbItem = {
    label: placeName('region', 'yerevan', 'Երևան'),
    to: getYerevanRoute(),
  }
  const forRegions = (): BreadcrumbItem[] => [HOME, { label: t('breadcrumb.regions') }]

  const forFreeRoutes = (): BreadcrumbItem[] => [HOME, { label: t('breadcrumb.freeRoutes') }]

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

  /**
   * `/manipulator/kotayk` — three levels, and the middle one is a real link.
   *
   * Unlike the two-level trail above, the parent here exists as a page, so it
   * gets a `to`. That is not cosmetic: `BreadcrumbList` is how a crawler learns
   * the eleven area pages hang off one parent rather than being eleven
   * unrelated top-level pages, which is what makes them a set worth ranking.
   */
  const forVehicleTypeGeo = (
    page: Pick<VehicleTypePage, 'heading' | 'slug'>,
    geo: Pick<VehicleTypeGeo, 'name'>,
  ): BreadcrumbItem[] => [
    HOME,
    { label: page.heading, to: getVehicleTypePageRoute(page.slug) },
    { label: geo.name },
  ]

  const forRegion = (region: Pick<Region, 'name' | 'slug'>): BreadcrumbItem[] => [
    HOME,
    { label: t('breadcrumb.regions'), to: getRegionsRoute() },
    { label: placeName('region', region.slug, region.name) },
  ]

  const forCity = (city: CityWithStats): BreadcrumbItem[] => [
    HOME,
    { label: placeName('region', city.regionSlug, city.regionName), to: getRegionRoute(city.regionSlug) },
    { label: placeName('city', city.slug, city.name) },
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
    zoneSlug?: string,
  ): BreadcrumbItem[] => [
    HOME,
    { label: placeName('region', regionSlug, regionName), to: getRegionRoute(regionSlug) },
    { label: zoneSlug ? placeName('zone', zoneSlug, zoneName) : zoneName },
  ]

  const forYerevan = (): BreadcrumbItem[] => [HOME, { label: YEREVAN.label }]

  const forDistrict = (district: Pick<District, 'name' | 'slug'>): BreadcrumbItem[] => [
    HOME,
    YEREVAN,
    { label: placeName('district', district.slug, district.name) },
  ]

  const forTowTruck = (truck: TowTruck, regionName?: string): BreadcrumbItem[] => {
    const trail: BreadcrumbItem[] = [HOME]
    const { location } = truck

    if (location.districtSlug) {
      trail.push(YEREVAN, {
        label: placeName('district', location.districtSlug, location.name),
        to: getDistrictRoute(location.districtSlug),
      })
    } else if (location.regionSlug && location.citySlug) {
      if (regionName) {
        trail.push({
          label: placeName('region', location.regionSlug, regionName),
          to: getRegionRoute(location.regionSlug),
        })
      }
      trail.push({
        label: placeName('city', location.citySlug, location.name),
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
    forVehicleTypeGeo,
    forRegion,
    forCity,
    forServiceZone,
    forYerevan,
    forDistrict,
    forTowTruck,
  }
}
