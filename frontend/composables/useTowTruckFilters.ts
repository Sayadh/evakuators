import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import type { TowTruckCard } from '~/types/towTruck'
import { trackFilterApply } from '~/utils/analytics'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'
import { applyTowTruckFilters, type BasePlace } from '~/utils/towTruckFilters'

/**
 * Every key `buildFilterQueryParams` can emit. Stripped from the URL before
 * the current state is written back, so a filter being turned OFF removes its
 * param instead of leaving the old value behind — a key missing from this list
 * is one that can never be cleared from a shared link.
 */
const FILTER_QUERY_KEYS = ['24h', 'vehicleType', 'services', 'capacity', 'doubleDeck', 'towHitch', 'sort']

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
  const seed = useListingShuffleSeed()

  const store = useTowTruckFiltersStore()
  const route = useRoute()
  const router = useRouter()

  store.replace(parseFilterQueryParams(route.query))

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
