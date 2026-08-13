import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import type { TowTruckCard } from '~/types/towTruck'
import { trackFilterApply } from '~/utils/analytics'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'
import { applyTowTruckFilters, type BasePlace } from '~/utils/towTruckFilters'

const FILTER_QUERY_KEYS = ['24h', 'manipulator', 'services', 'capacity', 'sort']

/**
 * Connects the filter store to a tow truck list:
 * restores state from the URL, keeps the URL in sync and returns the filtered list.
 *
 * `basePlace` is the city or Yerevan district this page is about, if it is
 * about one. Passing it puts the drivers *based* there above the ones who
 * merely also cover it, in the Recommended order only — see `sortTowTrucks`.
 * A page with no single place (a road corridor) omits it and nothing changes.
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
    applyTowTruckFilters(towTrucks.value, store.$state, toValue(basePlace), seed),
  )
  const activeFiltersCount = computed(() => store.activeFiltersCount)

  return {
    store,
    filteredTowTrucks,
    activeFiltersCount,
    resetFilters: () => store.reset(),
  }
}
