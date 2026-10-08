import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import type { TowTruckCard } from '~/types/towTruck'
import { trackFilterApply } from '~/utils/analytics'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'
import { applyTowTruckFilters } from '~/utils/towTruckFilters'

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
 * ## What this no longer does
 *
 * It used to decide the ORDER too — shuffle the list, keep three ranks ahead
 * of the shuffle, and search for a seed that did not repeat the visitor's last
 * order. All of that is in the backend now (`listing-order.ts`), which is why
 * this takes no seed and no base place: the list arrives already ordered, and
 * the first server-rendered paint is in its final order rather than in the
 * database's.
 *
 * What is left here is what only the browser can answer — which cards the
 * checkboxes allow, and the sort the customer picked — plus `remember`, the
 * one piece of the old design that had to stay on this side: the next request
 * is required to differ from the order this one showed, and only the browser
 * knows what it showed.
 */
export function useTowTruckFilters(
  towTrucks: Ref<TowTruckCard[]>,
  remember?: (ids: number[]) => void,
) {
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

  /**
   * Remember what this load actually put on the screen, for the next one to be
   * different from — read from the rendered list itself rather than recomputed,
   * so the two can never describe different orders.
   */
  remember?.(filteredTowTrucks.value.map((truck) => truck.id))

  const activeFiltersCount = computed(() => store.activeFiltersCount)

  return {
    store,
    filteredTowTrucks,
    activeFiltersCount,
    resetFilters: () => store.reset(),
  }
}
