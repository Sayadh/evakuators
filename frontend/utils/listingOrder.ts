/**
 * What a listing page tells the API about the order it wants.
 *
 * ## Why this is two numbers and not a shuffle
 *
 * The order of a town's drivers used to be decided here, in the browser's
 * render, from a seed minted during SSR. It produced the right picture, but it
 * meant the API's answer was not the listing: `/tow-trucks?city=…` returned
 * whatever the database happened to sort by, and the part that mattered — who
 * is first — existed only after a Vue computed had run. The ordering now lives
 * in the backend (`listing-order.ts` there), and this is the whole of what the
 * page still owns: the random number it was ordered by, and the order it was
 * shown last time.
 *
 * Both have to come from the page rather than be invented per request:
 *
 * - `seed` is minted ONCE per visit (`useListingShuffleSeed`), so walking from
 *   a town to a driver's profile and back does not reshuffle the list under
 *   somebody who was reading it;
 * - `avoid` is what makes the next load guaranteed different rather than
 *   usually different, and only the browser remembers it.
 */
export interface ListingOrderRequest {
  /** The random number this listing's order is built from */
  seed: number
  /** The ids, in order, this visitor was shown last time on this same listing */
  avoid?: number[]
}

/**
 * How many ids travel back to the API in `?avoid=`.
 *
 * Thirty, because that is roughly a first screenful plus what a thumb reaches
 * without deciding to scroll — and because this goes into a URL. The whole
 * previous listing would make every request unique for no gain: nobody
 * notices position 80 repeating. Mirrors `TOW_TRUCK_LISTING_AVOID_LIMIT`.
 */
export const LISTING_ORDER_AVOID_LIMIT = 30

/**
 * The cookie that remembers one listing's last order.
 *
 * A cookie rather than `sessionStorage` because the SERVER has to read it: a
 * refresh is a fresh SSR render, and that render is what asks the API for the
 * next order. `sessionStorage` would leave every refresh — the case actually
 * complained about — with nothing to avoid.
 *
 * Keyed by path, since "the same list" is what a repeat is relative to. The
 * path goes through `replace` rather than into the name as-is: a cookie name
 * is an RFC 6265 token, which `/` and `:` are not. Written raw, the browser
 * stores it and the server then fails to read it back — the avoidance silently
 * does nothing, which is exactly how it once behaved.
 */
export function listingOrderCookieName(path: string): string {
  return `listing-order-${path.replace(/[^a-z0-9]+/gi, '-')}`
}
