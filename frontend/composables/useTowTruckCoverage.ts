import { towTrucksService } from '~/services'
import type { TowTruckCoverage } from '~/types/towTruck'

/**
 * The single `GET /tow-trucks/coverage` fetch that every geography statistic on
 * the site derives from.
 *
 * ## What this replaced, and why
 *
 * Region / city / district cards all show a `towTruckCount`, which can only be
 * computed from tow truck data. Originally each location service fetched the
 * **entire fleet** for itself, so one homepage render issued five identical
 * `GET /tow-trucks` requests (measured) — each carrying every driver's phone,
 * WhatsApp, Telegram, email, description, price table and photo URLs, in order
 * to print a number on a card.
 *
 * That is now one request for a purpose-built response: per truck, only its base
 * location, its service-area slugs and a 24/7 flag. No personal data at all, and
 * a small fraction of the bytes.
 *
 * ## Why the two options are not optional
 *
 * - `dedupe: 'defer'` — `useAsyncData`'s default is `dedupe: 'cancel'`, which
 *   **aborts the in-flight request and starts a new one** every time another
 *   component calls the same key. Three components call `useRegions()` on the
 *   homepage and two call `useDistricts()`; with the default that was 3 + 2 = 5
 *   requests for one piece of data.
 * - `getCachedData` — reuses the payload on client-side navigation instead of
 *   refetching.
 *
 * Any new shared-key `useAsyncData` in this codebase should set both.
 */
export const TOW_TRUCK_COVERAGE_KEY = 'tow-truck-coverage'

export function useTowTruckCoverage() {
  return useAsyncData(TOW_TRUCK_COVERAGE_KEY, () => towTrucksService.getCoverage(), {
    default: () => [],
    dedupe: 'defer',
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  })
}

/**
 * Derives a value from the shared coverage list while keeping the
 * `{ data, pending, error, refresh, status }` shape call sites already expect
 * from `useAsyncData` — so a composable can switch to derivation without
 * breaking the components using it.
 *
 * `data` becomes a read-only computed, which is correct: a derived statistic is
 * not something a component should be able to assign to.
 */
export function useDerivedFromCoverage<T>(build: (coverage: TowTruckCoverage[]) => T) {
  const { data: coverage, pending, error, refresh, status } = useTowTruckCoverage()

  return {
    data: computed(() => build(coverage.value)),
    pending,
    error,
    refresh,
    status,
  }
}
