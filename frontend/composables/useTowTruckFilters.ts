import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import type { TowTruckCard } from '~/types/towTruck'
import { trackFilterApply } from '~/utils/analytics'
import { buildFilterQueryParams, parseFilterQueryParams } from '~/utils/queryParams'
import { pickListingSeed } from '~/utils/listingOrder'
import { applyTowTruckFilters, localRank, type BasePlace } from '~/utils/towTruckFilters'

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
  /**
   * One key per list, and a SAFE one.
   *
   * The path goes through `replace` rather than into the name as-is: a cookie
   * name is an RFC 6265 token, which `/` and `:` are not. Written raw, the
   * browser stores it and the server then fails to read it back — the
   * avoidance silently does nothing, which is exactly how it behaved.
   */
  const orderKey = `listing-order-${route.path.replace(/[^a-z0-9]+/gi, '-')}`
  const previousOrder = useCookie<number[] | null>(orderKey, {
    default: () => null,
    maxAge: 60 * 60,
    sameSite: 'lax',
  })

  /**
   * The one expression that orders this list.
   *
   * Shared by the seed chooser below and by the rendered computed on purpose:
   * when they were two separate calls they could — and did — disagree, and the
   * cookie then recorded an order the visitor was never shown, so the next
   * load avoided the wrong thing and repeated the right one.
   */
  const orderWith = (candidate: number): TowTruckCard[] =>
    applyTowTruckFilters(towTrucks.value, store.$state, candidate, toValue(basePlace))

  /**
   * The seed the page is ordered by — decided ONCE, and carried to the browser
   * in the payload rather than worked out again there.
   *
   * ## Why this must not be recomputed on the client
   *
   * The obvious shape — read the cookie, pick a seed, write the cookie — is
   * wrong, and wrong in a way that is invisible until you watch the page load.
   * The server reads the PREVIOUS order, picks a seed from it, and sets a new
   * cookie on the response. By the time the browser hydrates, it has already
   * applied that Set-Cookie, so re-running the same code there reads the NEW
   * order, avoids a different set of positions, and picks a different seed.
   * Server and client then disagree about who goes where, and Vue resolves it
   * by re-rendering the list a moment after it appears — the visible "settles,
   * then jumps" this composable's whole design exists to prevent.
   *
   * `useState` is what makes the decision travel instead of being repeated:
   * the initialiser runs on the server, the result is serialised into the
   * payload, and the browser reads the number rather than deriving it. The
   * cookie is read and written inside the initialiser for the same reason —
   * so the write happens exactly once, on the side that made the decision.
   *
   * Keyed by path: two towns are two lists and two histories.
   */
  const seed = useState<number>(`listing-seed:${route.path}`, () => {
    const chosen = pickListingSeed(
      rawSeed,
      previousOrder.value,
      orderWith,
      // A driver can only move among the slots of their own rank, so that is
      // what "could this position have been different" is judged against —
      // see repeatsAPosition. Corridor pages have no base place and therefore
      // no ranks: everyone is exchangeable with everyone.
      (truck) => {
        const place = toValue(basePlace)
        return place ? localRank(truck, place) : 1
      },
    )

    return chosen.seed
  }).value

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

  const filteredTowTrucks = computed(() => orderWith(seed))

  /**
   * Remember what this load actually put on the screen, for the next one to
   * avoid — read from the rendered list itself rather than recomputed, so the
   * two can never describe different orders.
   *
   * Capped: a cookie travels on every request to this origin, and only the
   * first screenful is what anybody notices repeating.
   */
  previousOrder.value = filteredTowTrucks.value.slice(0, 30).map((truck) => truck.id)
  const activeFiltersCount = computed(() => store.activeFiltersCount)

  return {
    store,
    filteredTowTrucks,
    activeFiltersCount,
    resetFilters: () => store.reset(),
  }
}
