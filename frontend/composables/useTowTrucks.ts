import { servesYerevan, towTrucksService } from '~/services'
import type { TowTruck } from '~/types/towTruck'

/**
 * Page-level tow truck lists — every one of these returns the smaller
 * `TowTruckCard` shape (see `types/towTruck.ts`), because a list is a list of
 * cards. The full profile comes from `useTowTruck(slug)` alone.
 *
 * These keep their own filtered backend requests: one city's trucks really is
 * different data from another's, and letting Postgres filter beats shipping the
 * whole fleet to render one city page. The per-area *counters* next to them come
 * from `useTowTruckCoverage()`, which is a different, much smaller request.
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

/** The only composable that returns a full profile */
export function useTowTruck(slug: string) {
  return useAsyncData(`tow-truck-${slug}`, () => towTrucksService.getBySlug(slug))
}

export function useFeaturedTowTrucks(limit = 6) {
  return useAsyncData(`featured-tow-trucks-${limit}`, () => towTrucksService.getFeatured(limit), {
    default: () => [],
  })
}

/** The actual Yerevan listing — used by `/yerevan`, which renders the trucks */
export function useTowTrucksInYerevan() {
  return useAsyncData('tow-trucks-yerevan', () => towTrucksService.getYerevanTowTrucks(), {
    default: () => [],
    dedupe: 'defer',
  })
}

/**
 * Just the number, for the homepage's Yerevan tile.
 *
 * Derived from the shared coverage response rather than the listing: the tile
 * shows a count, so downloading the trucks themselves to call `.length` on them
 * would be the exact mistake the coverage endpoint exists to prevent.
 *
 * It must be a distinct count over `servesYerevan`, NOT the sum of each
 * district's own `towTruckCount` — a single driver who lists ten districts as
 * their service area would otherwise be counted ten times.
 */
export function useYerevanTowTruckCount() {
  return useDerivedFromCoverage((coverage) => coverage.filter(servesYerevan).length)
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
