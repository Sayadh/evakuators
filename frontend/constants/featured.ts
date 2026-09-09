/**
 * How long a paid top placement can be bought for.
 *
 * MANUAL SYNC POINT: the same three numbers as `FEATURED_MIN_DAYS` /
 * `FEATURED_MAX_DAYS` in `backend/src/tow-trucks/featured.ts`, which is the
 * authority — the backend refuses anything outside them, so a wider range here
 * would only produce a 400 the admin has to read instead of a hint they could
 * have read first. Same class of duplication as the `LocationType` values, and
 * pinned the same way, in `tests/featuredDays.spec.ts`.
 */
export const FEATURED_MIN_DAYS = 1
export const FEATURED_MAX_DAYS = 30

/**
 * What the dialog opens on.
 *
 * A week, because that is the placement an operator quotes without thinking
 * about it, and a default nobody changes should be the common case rather than
 * the smallest legal one.
 */
export const FEATURED_DEFAULT_DAYS = 7
