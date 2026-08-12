/**
 * Every tunable number for the "nearest evacuator" search, in one file — same
 * convention as `analytics.constants.ts`.
 */

/**
 * How many drivers PostGIS hands to the route-matrix step.
 *
 * The two numbers below are one decision, not two. A matrix request costs the
 * same whether it resolves 5 destinations or 30, so the prefilter is sized to be
 * comfortably larger than the answer: straight-line order and road order differ
 * (a driver 3 km away across a gorge is further by road than one 6 km away on
 * the highway), and the only way to get the road-nearest 10 right is to route
 * more than 10 candidates.
 *
 * 25 was chosen because it is the point where adding more stops changing the
 * top 10 for any realistic Armenian geography, while staying far below
 * OpenRouteService's own per-request ceiling.
 */
export const NEAREST_CANDIDATE_LIMIT = 25

/** What the visitor actually receives. */
export const NEAREST_RESULT_LIMIT = 10

/**
 * Nothing beyond this is offered at all.
 *
 * A driver 180 km away is not a useful answer to "who can reach me", and
 * returning them would make the page look like it worked when it did not. It
 * also bounds the PostGIS scan: without a radius the KNN operator happily walks
 * the whole country to fill 25 slots.
 *
 * 150 km covers any point in Armenia from a driver in the nearest sizeable
 * town, with room to spare — the country is ~400 km at its longest.
 */
export const NEAREST_RADIUS_METERS = 150_000

/**
 * How long a result set is reused, and for whom.
 *
 * The whole response is cached, keyed on the visitor's rounded position (see
 * below), because the expensive half — one external matrix request — depends on
 * nothing else. Five minutes is short enough that a driver who just registered
 * appears almost immediately, and long enough that a visitor reloading the page
 * or granting permission twice costs one request rather than three.
 */
export const NEAREST_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Decimal places the cache key rounds the visitor's coordinates to.
 *
 * 3 places is ~110 m. Two people on the same street share a cache entry, which
 * is the point: it is what turns a burst of nearby requests into one upstream
 * call. It is also a deliberate privacy property — the key that lives in memory
 * is a neighbourhood, not a doorstep, and it is the ONLY form in which a
 * visitor's position exists anywhere on the server (never in the database, see
 * docs/nearest-search.md).
 */
export const NEAREST_CACHE_KEY_PRECISION = 3

/** Hard cap on cache entries, so a scripted sweep of coordinates cannot grow it without bound */
export const NEAREST_CACHE_MAX_ENTRIES = 500

/**
 * Requests per minute per IP for the search endpoint.
 *
 * Stricter than the global 60/60s because each miss can cost an external matrix
 * request against a metered quota. Loose enough that a person retrying after a
 * permission prompt, or two people behind one office NAT, never sees a 429.
 */
export const NEAREST_THROTTLE_LIMIT = 10
export const NEAREST_THROTTLE_TTL_MS = 60_000

/**
 * Real daily cap on the OpenRouteService key this deployment actually uses.
 *
 * ## Why this exists, and why it replaced a per-IP ceiling
 *
 * An earlier version of this file capped searches per IP address (40/day) as
 * an abuse ceiling. That was the wrong quantity to protect: the thing that
 * can actually run out is the ONE shared daily budget the whole platform
 * draws from, and a per-IP number set low enough to matter (40) still lets a
 * modest handful of distinct addresses — 13 of them, doing nothing unusual —
 * collectively exceed it, while a per-IP number set high enough not to matter
 * protects nothing. The budget that needs a cap is global, so it is now
 * counted directly instead of proxied through IPs.
 *
 * 500 is this deployment's actual key, confirmed against the ORS account —
 * not the 2,500/day sometimes advertised for the free tier in general; keys
 * and tiers vary, and this number is the one that is real for this platform.
 */
export const NEAREST_ORS_DAILY_QUOTA = 500

/**
 * Headroom subtracted from the raw quota before the app calls it "no budget
 * left for today". Traffic is not perfectly even across a day, and the last
 * few calls of the quota are worth more as a buffer against a burst than as a
 * few extra visitors getting a road distance instead of a straight line.
 */
export const NEAREST_ORS_DAILY_SAFETY_MARGIN = 20

/**
 * The number of matrix calls this app will actually make in one Armenia day
 * before degrading. Past this, `NearestService` skips the ORS call entirely
 * and serves straight-line distances — the same `routed: false` outcome the
 * page already renders when a call fails, so a visitor is degraded, never
 * refused. There is deliberately no 429 for this: unlike the per-minute
 * throttle, running out of ORS budget is not the visitor's doing.
 */
export const NEAREST_ORS_DAILY_CALL_LIMIT = NEAREST_ORS_DAILY_QUOTA - NEAREST_ORS_DAILY_SAFETY_MARGIN

/** Timeout for the matrix call — past this the straight-line fallback is better than waiting */
export const ROUTE_MATRIX_TIMEOUT_MS = 4000
