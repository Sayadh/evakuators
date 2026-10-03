import { dateKeyToDate, shiftDateKey, toAnalyticsDateKey } from '../analytics/analytics.utils'

/**
 * Tunables for the dispatcher's coordinate-based search, in one file — same
 * convention as `nearest.constants.ts`.
 *
 * Deliberately its own numbers rather than importing `NEAREST_RADIUS_METERS`/
 * `NEAREST_CANDIDATE_LIMIT`: those bound a different question (how far can a
 * STRANDED VISITOR'S driver reasonably be) asked by a different endpoint, and
 * there is no reason a tuning change made for one screen should silently move
 * the other.
 */

/**
 * Nothing beyond this is offered at all.
 *
 * Same distance `nearest-tow-trucks` uses (see `NEAREST_RADIUS_METERS`) — it
 * is still the same country, and 150 km already covers any point in Armenia
 * from a driver in the nearest sizeable town. It also bounds the PostGIS scan:
 * without a radius the KNN operator walks the whole country to fill the limit.
 */
export const DISPATCH_COORDINATES_RADIUS_METERS = 150_000

/**
 * How many candidates the coordinate search returns.
 *
 * Higher than the customer-facing search's 10: a dispatcher choosing who to
 * call benefits from seeing more of the field (rating, subscription status,
 * how recently each was used) than a stranded visitor does, and there is no
 * routing step here whose cost scales with this number.
 */
/**
 * How far back the card's «զանգ» figure looks.
 *
 * Rolling, not calendar: a dispatcher reads this number to tell a busy driver
 * from a quiet one, and a calendar month answers that differently on the 2nd
 * than on the 28th. Thirty days answers it the same way every day.
 */
/** Shortest term the driver search will run on — one letter matches most of the table */
export const DISPATCH_SEARCH_MIN_LENGTH = 2

/**
 * How many drivers a name search returns.
 *
 * A dispatcher searching by name is looking for ONE driver they already have
 * in mind, not browsing. Twenty is enough that a common first name still shows
 * the right person, and small enough that the lookups behind each card
 * (referrals, calls, ratings, coverage) stay four grouped queries over a short
 * list.
 */
export const DISPATCH_SEARCH_LIMIT = 20

export const DISPATCH_CALLS_WINDOW_DAYS = 30

/**
 * The first Armenia calendar day the «զանգ» figure counts, given "now".
 *
 * Through the calendar rather than by subtracting milliseconds: `statDate` is
 * a DATE in Armenia's calendar, so a raw instant would start the window at a
 * different hour depending on the server's own offset — and the figure would
 * quietly differ between a server in Yerevan and one in UTC.
 *
 * Inclusive of today, hence the minus one: thirty days means today and the
 * twenty-nine before it, not today plus thirty.
 */
export function dispatchCallsWindowStart(now: Date): Date {
  return dateKeyToDate(shiftDateKey(toAnalyticsDateKey(now), -(DISPATCH_CALLS_WINDOW_DAYS - 1)))
}

export const DISPATCH_COORDINATES_LIMIT = 30
