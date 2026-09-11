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
export const DISPATCH_COORDINATES_LIMIT = 30
