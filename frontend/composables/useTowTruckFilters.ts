import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import type { TowTruckCard } from '~/types/towTruck'
import { trackFilterApply } from '~/utils/analytics'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'
import { pickListingSeed } from '~/utils/listingOrder'
import { applyTowTruckFilters, type BasePlace } from '~/utils/towTruckFilters'

/**
 * Every key `buildFilterQueryParams` can emit. Stripped from the URL before
 * the current state is written back, so a filter being turned OFF removes its
 * param instead of leaving the old value behind — a key missing from this list
 * is one that can never be cleared from a shared link.
 */
const FILTER_QUERY_KEYS = ['24h', 'vehicleType', 'services', 'capacity', 'wheelSkates', 'doubleDeck', 'towHitch', 'sort']

/**
 * Connects the filter store to a tow truck list:
 * restores state from the URL, keeps the URL in sync and returns the filtered list.
 *
 * The only two pages that call this — the city and Yerevan district search
 * pages — show the Recommended order shuffled, with one tier ahead of the
 * shuffle: drivers actually based in the town/district being searched come
 * first (see `applyTowTruckFilters`'s `basePlace`). `basePlace` is optional
 * because the city page also serves road corridors, which have no base-place
 * concept at all (see `BasePlace`).
 */
export function useTowTruckFilters(
  towTrucks: Ref<TowTruckCard[]>,
  basePlace?: MaybeRefOrGetter<BasePlace | undefined>,
) {
  // Read once, in setup: `useState` cannot be reached from inside a computed's
  // getter, and the value must be the same one the SSR pass used anyway.
  const rawSeed = useListingShuffleSeed()

  const store = useTowTruckFiltersStore()
  const route = useRoute()
  const router = useRouter()

  store.replace(parseFilterQueryParams(route.query))

  /**
   * The order this visitor saw last time on this exact list, so the next one
   * can be guaranteed to differ.
   *
   * A cookie rather than `sessionStorage` because the server has to read it:
   * a refresh is a fresh SSR render, and the server is the one choosing the
   * order. `sessionStorage` would leave every refresh — the case actually
   * complained about — with no previous order to avoid.
   *
   * Keyed by path, since "the same list" is what a repeat is relative to.
   * `maxAge` is short on purpose: this is worth remembering for the next
   * refresh, not for next week, and a stale order from days ago would only
   * constrain today's shuffle for no reason.
   */
  const previousOrder = useCookie<number[] | null>(`listing-order:${route.path}`, {
    default: () => null,
    maxAge: 60 * 60,
    sameSite: 'lax',
  })

  /**
   * Chosen once per page load, from the list as it arrives — before any filter
   * is applied, so that ticking a filter does not re-roll the order under the
   * visitor. Server and browser run this with the same list and the same
   * cookie, so they reach the same seed and hydration holds.
   */
  const { seed, ordered } = pickListingSeed(rawSeed, previousOrder.value, (candidate) =>
    applyTowTruckFilters(towTrucks.value, store.$state, candidate, toValue(basePlace)),
  )

  // Written back for the next load. Capped because a cookie is sent on every
  // request to this origin, and only the first screenful is what anybody
  // notices repeating.
  previousOrder.value = ordered.slice(0, 30).map((truck) => truck.id)

  function syncQuery(): void {
    const query = Object.fromEntries(
      Object.entries(route.query).filter(([key]) => !FILTER_QUERY_KEYS.includes(key)),
    )
    for (const [key, value] of Object.entries(buildFilterQueryParams(store.$state))) {
      if (value !== undefined) query[key] = value
    }
    router.replace({ query })
  }

  if (import.meta.client) {
    store.$subscribe(() => {
      syncQuery()
      trackFilterApply(store.activeFiltersCount)
    })
  }

  const filteredTowTrucks = computed(() =>
    applyTowTruckFilters(towTrucks.value, store.$state, seed, toValue(basePlace)),
  )
  const activeFiltersCount = computed(() => store.activeFiltersCount)

  return {
    store,
    filteredTowTrucks,
    activeFiltersCount,
    resetFilters: () => store.reset(),
  }
}
