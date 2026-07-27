import { towTrucksService } from '~/services'
import type { TowTruck } from '~/types/towTruck'

/**
 * The single `GET /tow-trucks` fetch that every geography statistic on the site
 * derives from.
 *
 * ## Why one shared key, and why these two options
 *
 * Region / city / district cards all show a `towTruckCount`, which can only be
 * computed from the tow truck list. Previously each location service fetched
 * that list itself, so one homepage render issued **five** identical
 * `GET /tow-trucks` requests (measured). Two separate causes:
 *
 * 1. `useRegions()` and `useDistricts()` were different `useAsyncData` keys, so
 *    each fetched the same full list independently. Fixed by having both derive
 *    from this one key.
 * 2. `useAsyncData`'s default `dedupe: 'cancel'` means that when a *second*
 *    component calls the same key, Nuxt **aborts the in-flight request and
 *    starts a new one**. On the homepage `useRegions()` is called from three
 *    components (`RegionsSection`, `LocationSearch`, `AppFooter`) and
 *    `useDistricts()` from two → 3 + 2 = 5 requests. `dedupe: 'defer'` makes
 *    later callers await the request already in flight instead.
 *
 * `getCachedData` covers the other direction: a client-side navigation back to a
 * page that uses this key reuses the payload rather than refetching.
 *
 * Note this is intentionally the *unfiltered* list. Page-level lists (one city,
 * one district, one region) still use their own filtered requests via
 * `useTowTrucksByCity` and friends — those are genuinely different data, and
 * asking the backend to filter is cheaper than shipping the whole fleet for a
 * single city page.
 */
export const ALL_TOW_TRUCKS_KEY = 'tow-trucks-all'

export function useAllTowTrucks() {
  return useAsyncData(ALL_TOW_TRUCKS_KEY, () => towTrucksService.getAll(), {
    default: () => [],
    dedupe: 'defer',
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  })
}

/**
 * Derives a value from the shared tow truck list while keeping the
 * `{ data, pending, error, refresh, status }` shape call sites already expect
 * from `useAsyncData` — so switching a composable over to derivation is not a
 * breaking change for the components using it.
 *
 * `data` becomes a read-only computed, which is correct: a derived statistic is
 * not something a component should be able to assign to.
 */
export function useDerivedFromTowTrucks<T>(build: (trucks: TowTruck[]) => T) {
  const { data: trucks, pending, error, refresh, status } = useAllTowTrucks()

  return {
    data: computed(() => build(trucks.value)),
    pending,
    error,
    refresh,
    status,
  }
}
