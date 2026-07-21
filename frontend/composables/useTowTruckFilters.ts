import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import type { TowTruck } from '~/types/towTruck'
import { trackFilterApply } from '~/utils/analytics'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'
import { applyTowTruckFilters } from '~/utils/towTruckFilters'

const FILTER_QUERY_KEYS = ['24h', 'manipulator', 'services', 'capacity', 'sort']

/**
 * Connects the filter store to a tow truck list:
 * restores state from the URL, keeps the URL in sync and returns the filtered list.
 */
export function useTowTruckFilters(towTrucks: Ref<TowTruck[]>) {
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

  const filteredTowTrucks = computed(() => applyTowTruckFilters(towTrucks.value, store.$state))
  const activeFiltersCount = computed(() => store.activeFiltersCount)

  return {
    store,
    filteredTowTrucks,
    activeFiltersCount,
    resetFilters: () => store.reset(),
  }
}
