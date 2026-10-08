import {
  LISTING_ORDER_AVOID_LIMIT,
  listingOrderCookieName,
  type ListingOrderRequest,
} from '~/utils/listingOrder'

/**
 * The order request this page sends to the API, and the memory behind it.
 *
 * Read in `setup`, BEFORE the drivers are fetched, because the API needs it to
 * answer: the listing comes back already in the order it will be read, first
 * paint included. That is the difference this composable exists to make — the
 * old design fetched a list and reordered it in a computed, so the server
 * rendered one order and the shuffle was a thing that happened to the page
 * afterwards.
 *
 * `remember` is called with what actually reached the screen, so the next load
 * can be guaranteed to differ from it. Reading the RENDERED list rather than
 * recomputing it is deliberate: when the two were computed separately they
 * could — and did — disagree, and the cookie then recorded an order the
 * visitor was never shown, so the next load avoided the wrong thing and
 * repeated the right one.
 */
export function useListingOrder(): ListingOrderRequest & { remember: (ids: number[]) => void } {
  const route = useRoute()
  const previousOrder = useCookie<number[] | null>(listingOrderCookieName(route.path), {
    default: () => null,
    // Short on purpose: this is worth remembering for the next refresh, not
    // for next week, and a stale order from days ago would only constrain
    // today's shuffle for no reason.
    maxAge: 60 * 60,
    sameSite: 'lax',
  })

  return {
    seed: useListingShuffleSeed(),
    avoid: previousOrder.value ?? undefined,
    remember: (ids: number[]) => {
      previousOrder.value = ids.slice(0, LISTING_ORDER_AVOID_LIMIT)
    },
  }
}
