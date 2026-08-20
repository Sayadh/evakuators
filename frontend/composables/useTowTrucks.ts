import type { VehicleTypeGeo } from '~/constants/vehicleTypePages'
import { servesYerevan, towTrucksService } from '~/services'
import { SortOption, type VehicleType } from '~/types/enums'
import type { TowTruck, TowTruckCard } from '~/types/towTruck'
import { sortTowTrucks } from '~/utils/towTruckFilters'

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

/**
 * Every list leaves this file already in "Recommended" order.
 *
 * ## Why here and not in the pages
 *
 * Ordering used to be applied by `useTowTruckFilters()`, which only the two
 * pages with a filter sidebar call — `/regions/[region]/[city]` and
 * `/yerevan/[district]`. The other three listings render the array exactly as
 * the API returned it: "Բոլոր էվակուատորները մարզում"
 * (`/regions/[region]/index.vue`), "Բոլոր էվակուատորները Երևանում"
 * (`/yerevan/index.vue`) and the homepage's featured section. On those, a
 * driver's rating changed nothing — the order was the backend's `ORDER BY`
 * (`works24Hours`, then `createdAt`), so with every truck on 24/7 it was
 * effectively oldest-registered-last.
 *
 * Putting it in the composable means a page cannot forget: there is no listing
 * that reaches a component without passing through here. The filter pages
 * re-sort on top of this whenever the visitor picks a different option, which
 * is harmless — sorting an already-sorted array by the same key is a no-op.
 *
 * The backend's `ORDER BY` stays as it is. It is not redundant: it is what
 * makes `limit`/`offset` paging return a stable set of rows (see the `id`
 * tie-break in `TowTrucksRepository.findManyCards`), which this cannot do.
 */
/**
 * The seed is read here, once, rather than inside `recommended()`.
 *
 * `transform` runs outside a component's setup context (it is called by
 * `useAsyncData` when the request resolves), and `useState` must not be reached
 * from there — so the value is captured while the composable is still running
 * and closed over.
 */
function recommendedWith(seed: number) {
  return (trucks: TowTruckCard[]): TowTruckCard[] =>
    sortTowTrucks(trucks, SortOption.Recommended, seed)
}

export function useTowTrucksByCity(citySlug: string) {
  return useAsyncData(`tow-trucks-city-${citySlug}`, () => towTrucksService.getByCitySlug(citySlug), {
    default: () => [],
    transform: recommendedWith(useListingShuffleSeed()),
  })
}

export function useTowTrucksByDistrict(districtSlug: string) {
  return useAsyncData(
    `tow-trucks-district-${districtSlug}`,
    () => towTrucksService.getByDistrictSlug(districtSlug),
    { default: () => [], transform: recommendedWith(useListingShuffleSeed()) },
  )
}

/** The only composable that returns a full profile */
export function useTowTruck(slug: string) {
  return useAsyncData(`tow-truck-${slug}`, () => towTrucksService.getBySlug(slug))
}

export function useFeaturedTowTrucks(limit = 6) {
  return useAsyncData(`featured-tow-trucks-${limit}`, () => towTrucksService.getFeatured(limit), {
    default: () => [],
    // Being featured is the admin's pick of WHICH trucks appear; the order
    // among them is still "best first", same as every other listing.
    transform: recommendedWith(useListingShuffleSeed()),
  })
}

/** The actual Yerevan listing — used by `/yerevan`, which renders the trucks */
export function useTowTrucksInYerevan() {
  return useAsyncData('tow-trucks-yerevan', () => towTrucksService.getYerevanTowTrucks(), {
    default: () => [],
    dedupe: 'defer',
    transform: recommendedWith(useListingShuffleSeed()),
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

/**
 * Drivers on one road corridor — exact slug match, no city fallback. Its own
 * composable rather than a flag on `useTowTrucksByCity`, because it is a
 * different endpoint answering a different question.
 */
export function useTowTrucksByZone(zoneSlug: string) {
  return useAsyncData(
    `tow-trucks-zone-${zoneSlug}`,
    () => towTrucksService.getByZoneSlug(zoneSlug),
    { default: () => [], transform: recommendedWith(useListingShuffleSeed()) },
  )
}

/**
 * Every truck of one vehicle type, country-wide — `/manipulator` and
 * `/tsanr-tehnika`.
 *
 * No `basePlace` in the sort: these pages are not about a place, so "the
 * drivers based here first" has nothing to mean. `recommended` alone leaves
 * rating deciding, which is the right answer for a country-wide list.
 */
export function useTowTrucksByVehicleType(vehicleType: VehicleType) {
  return useAsyncData(
    `tow-trucks-vehicle-type-${vehicleType}`,
    () => towTrucksService.getByVehicleType(vehicleType),
    { default: () => [], transform: recommendedWith(useListingShuffleSeed()) },
  )
}

/**
 * One vehicle type in one area — `/manipulator/kotayk`, `/manipulator/yerevan`.
 *
 * Branches on `geo.isYerevan` because Yerevan is not a marz anywhere in this
 * system: it is the `yerevan=true` filter, exactly as `/yerevan` is (CLAUDE.md
 * § geography). Hiding that branch here rather than in the page keeps the two
 * page files identical and keeps `VehicleTypeListing` free of geography rules.
 *
 * The key carries both halves, so `/manipulator/kotayk` and
 * `/tsanr-tehnika/kotayk` cannot share a payload — they are different lists
 * that happen to be about the same marz, and `useAsyncData` dedupes by key.
 *
 * No filter-page tiering involved here — this listing keeps the rating band
 * (`sortTowTrucks`'s default `tiered: true`), the same as every listing except
 * the city/district search pages.
 */
export function useTowTrucksByVehicleTypeInGeo(vehicleType: VehicleType, geo: VehicleTypeGeo) {
  return useAsyncData(
    `tow-trucks-vehicle-type-${vehicleType}-geo-${geo.slug}`,
    () =>
      geo.isYerevan
        ? towTrucksService.getYerevanTowTrucks(vehicleType)
        : towTrucksService.getByRegionSlug(geo.slug, vehicleType),
    { default: () => [], transform: recommendedWith(useListingShuffleSeed()) },
  )
}

export function useTowTrucksByRegion(regionSlug: string) {
  return useAsyncData(
    `tow-trucks-region-${regionSlug}`,
    () => towTrucksService.getByRegionSlug(regionSlug),
    { default: () => [], transform: recommendedWith(useListingShuffleSeed()) },
  )
}

export function useSimilarTowTrucks(truck: TowTruck) {
  return useAsyncData(`similar-tow-trucks-${truck.slug}`, () => towTrucksService.getSimilar(truck), {
    default: () => [],
    transform: recommendedWith(useListingShuffleSeed()),
  })
}
