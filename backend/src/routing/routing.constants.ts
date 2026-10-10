/**
 * The routing provider's own numbers — the daily budget and the call timeout.
 *
 * Their own file, and their own module, because they stopped belonging to one
 * feature the day a second one started routing. `/evakuator` ranks a visitor's
 * candidates by road distance and `/admin/dispatch`'s coordinate search now
 * does the same, and both draw on ONE key with ONE daily allowance — so the
 * count has to be one count. A copy per feature would be two features each
 * believing it had the whole budget.
 */

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
export const ROUTE_ORS_DAILY_QUOTA = 500

/**
 * Headroom subtracted from the raw quota before the app calls it "no budget
 * left for today". Traffic is not perfectly even across a day, and the last
 * few calls of the quota are worth more as a buffer against a burst than as a
 * few extra visitors getting a road distance instead of a straight line.
 */
export const ROUTE_ORS_DAILY_SAFETY_MARGIN = 20

/**
 * The number of matrix calls this app will actually make in one Armenia day
 * before degrading. Past this, both callers skip the ORS call entirely
 * and serve straight-line distances — the same `routed: false` outcome the
 * page already renders when a call fails, so a visitor is degraded, never
 * refused. There is deliberately no 429 for this: unlike the per-minute
 * throttle, running out of ORS budget is not the visitor's doing.
 */
export const ROUTE_ORS_DAILY_CALL_LIMIT = ROUTE_ORS_DAILY_QUOTA - ROUTE_ORS_DAILY_SAFETY_MARGIN

/** Timeout for the matrix call — past this the straight-line fallback is better than waiting */
export const ROUTE_MATRIX_TIMEOUT_MS = 4000
