import { selectYerevanTowTrucks, towTrucksService } from '~/services'
import type { TowTruck } from '~/types/towTruck'

/**
 * Page-level tow truck lists. These keep their own filtered backend requests —
 * one city's trucks really is different data from another's, and letting the
 * backend filter beats shipping the whole fleet to render one city page.
 *
 * The exception is Yerevan (below), which is derived rather than fetched.
 */

export function useTowTrucksByCity(citySlug: string) {
  return useAsyncData(`tow-trucks-city-${citySlug}`, () => towTrucksService.getByCitySlug(citySlug), {
    default: () => [],
  })
}

export function useTowTrucksByDistrict(districtSlug: string) {
  return useAsyncData(
    `tow-trucks-district-${districtSlug}`,
    () => towTrucksService.getByDistrictSlug(districtSlug),
    { default: () => [] },
  )
}

export function useTowTruck(slug: string) {
  return useAsyncData(`tow-truck-${slug}`, () => towTrucksService.getBySlug(slug))
}

export function useFeaturedTowTrucks(limit = 6) {
  return useAsyncData(`featured-tow-trucks-${limit}`, () => towTrucksService.getFeatured(limit), {
    default: () => [],
  })
}

/**
 * Derived from the shared full list, not a `?yerevan=true` request: both callers
 * (`RegionsSection` on the homepage, `/yerevan`) already load that list for the
 * per-district counts, so this is free. See `selectYerevanTowTrucks()`.
 */
export function useTowTrucksInYerevan() {
  return useDerivedFromTowTrucks(selectYerevanTowTrucks)
}

export function useTowTrucksByRegion(regionSlug: string) {
  return useAsyncData(
    `tow-trucks-region-${regionSlug}`,
    () => towTrucksService.getByRegionSlug(regionSlug),
    { default: () => [] },
  )
}

export function useSimilarTowTrucks(truck: TowTruck) {
  return useAsyncData(`similar-tow-trucks-${truck.slug}`, () => towTrucksService.getSimilar(truck), {
    default: () => [],
  })
}
