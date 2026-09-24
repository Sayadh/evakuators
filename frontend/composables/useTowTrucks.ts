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
 * Putting it in the composable means a page cannot forget — with three
 * exceptions, marked below, and they are exceptions because of what
 * "Recommended" actually is.
 *
 * ## It is a SHUFFLE, so applying it twice is not a no-op
 *
 * This used to say re-sorting on top was harmless, "sorting an already-sorted
 * array by the same key". It is not a key. `SortOption.Recommended` shuffles
 * first (`sortTowTrucks`), and the pages with a filter sidebar shuffle again —
 * with the SAME seed, since both read `useListingShuffleSeed()`. Same seed,
 * same Fisher–Yates draws, so the same positional permutation P lands twice:
 * the list comes out as P², and squares are not uniform. Every 2-cycle squares
 * to the identity, so the identity is wildly over-represented and the list is
 * dragged back toward the order the backend sent.
 *
 * Measured on a ten-driver town: the driver the API returns first led the page
 * 20% of the time instead of 10%, twice as many drivers sat in their original
 * slot, and the whole list came back completely unshuffled 0.25% of the time
 * against 0.000028% for a real shuffle. On a four-driver town — an Ashtarak,
 * a Nor Norq — it was 50% and 42%.
 *
 * So the three composables whose pages call `useTowTruckFilters` hand over the
 * API's own order and let that one shuffle be the only one. The other five
 * render what they are given and keep the transform.
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

/**
 * No `transform` — `/regions/[region]/[city]` runs `useTowTruckFilters`, which
 * shuffles. See the § above for what the second shuffle did to the first.
 */
export function useTowTrucksByCity(citySlug: string) {
  return useAsyncData(`tow-trucks-city-${citySlug}`, () => towTrucksService.getByCitySlug(citySlug), {
    default: () => [],
  })
}

/** No `transform` — `/yerevan/[district]` shuffles in `useTowTruckFilters`. */
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

/**
 * The homepage strip.
 *
 * Deliberately NOT `recommendedWith`, unlike every other listing here. That
 * transform shuffles and then groups by rating band, and it used to be right:
 * being featured was an editorial pick of WHICH drivers appeared, and the order
 * among them was nobody's business.
 *
 * A placement is now bought, for a number of days, and the backend returns them
 * newest purchase first — including a `nulls: 'last'` on the sort so the legacy
 * open-ended picks cannot displace someone who paid. Re-shuffling here threw
 * all of that away on arrival, which meant the driver who paid this morning
 * could sit below one who paid nothing, and could move on every refresh.
 *
 * So the server's order stands. Nothing else on the site orders itself by
 * money, and this is the one place that has to.
 */
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
 *
 * No `transform`, for the same reason as the two above: it is served by
 * `/regions/[region]/[city]`, which shuffles in `useTowTruckFilters`.
 */
export function useTowTrucksByZone(zoneSlug: string) {
  return useAsyncData(
    `tow-trucks-zone-${zoneSlug}`,
    () => towTrucksService.getByZoneSlug(zoneSlug),
    { default: () => [] },
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
