/**
 * The paid top placement — how long it lasts, and whether it is live right now.
 *
 * Pure and database-free for the same reason `dispatch-ranking.ts` is: this is
 * the rule a driver pays for and will argue about, so it has to be readable on
 * its own and testable without a row.
 */

/**
 * The shortest and longest a placement can be bought for.
 *
 * One day at the bottom because that is a real product — a driver with a slow
 * Tuesday buys tomorrow. Thirty at the top because a placement is the scarcest
 * thing on the site: one town has one first position, and a grant measured in
 * months would take it off the market long enough that "you can buy the top
 * spot" stops being true for everyone else.
 */
export const FEATURED_MIN_DAYS = 1
export const FEATURED_MAX_DAYS = 30

/** Everything the window rules need from a truck — a shape, not the Prisma row */
export interface FeaturedWindow {
  isFeatured: boolean
  featuredUntil: Date | null
}

/**
 * Is this driver's placement live at `now`?
 *
 * ## Why every read goes through this instead of reading `isFeatured`
 *
 * Because the flag alone is stale by design. The expiry sweep runs hourly, so
 * between two runs there is always a window in which `featuredUntil` has passed
 * and the boolean is still `true` — and in that window a driver would be
 * sitting in a paid slot they no longer paid for, above drivers who did. A
 * cron job is cleanup; it must never be the thing that decides what a visitor
 * sees.
 *
 * ## Why `null` means forever rather than expired
 *
 * Every placement granted before durations existed has no end date. Reading
 * `null` as "over" would have quietly cleared the editorial homepage picks the
 * moment this deployed — a data migration disguised as a rule. So `null` is an
 * open-ended placement, and it can only be created by the old code path, never
 * by the admin dialog, which requires a number of days.
 */
export function isFeaturedNow(truck: FeaturedWindow, now: Date): boolean {
  if (!truck.isFeatured) return false
  if (truck.featuredUntil === null) return true
  return truck.featuredUntil.getTime() > now.getTime()
}

/**
 * When a placement bought now, for `days` days, runs out.
 *
 * Counted from `now` rather than from midnight: a placement bought at 18:00 for
 * one day is worth an evening and a morning, and the alternative — expiring at
 * tonight's midnight — sells six hours as a day. Whole days from the moment of
 * purchase is the reading a driver would recognise from being told "24 hours".
 */
export function featuredUntilFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

/** Whether a requested duration is one the product actually sells */
export function isValidFeaturedDays(days: number): boolean {
  return Number.isInteger(days) && days >= FEATURED_MIN_DAYS && days <= FEATURED_MAX_DAYS
}
