/**
 * "Which calendar day is it in Armenia" — the one question two unrelated
 * features both need to answer identically.
 *
 * The VPS runs UTC. Anything that resets "per day" and uses the server's own
 * day boundary resets at 04:00 Yerevan time, which is both wrong and
 * impossible to explain to a user who was told «փորձեք վաղը».
 *
 * `Asia/Yerevan` is resolved through the ICU timezone database rather than a
 * hardcoded `+4`, so a future DST change is the timezone database's problem
 * and not a bug in this file. Armenia has no DST today.
 */

/**
 * The single source of truth for the project's timezone string.
 * `ANALYTICS_TIMEZONE` re-exports this rather than repeating the literal, so
 * there is exactly one place in the backend where `'Asia/Yerevan'` is written.
 */
export const ARMENIA_TIMEZONE = 'Asia/Yerevan'

/**
 * `en-CA` is not a stylistic choice: it is the locale whose short date format
 * is exactly ISO `YYYY-MM-DD`, which is how a timezone-correct calendar date
 * comes out of ICU with no manual offset arithmetic.
 *
 * Built once at module load — `Intl.DateTimeFormat` construction is the
 * expensive part, `format()` is not.
 */
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARMENIA_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Which Armenia calendar day does this instant fall on? → `'2026-08-12'`.
 *
 * A string, not a `Date`, deliberately — the same reasoning
 * `analytics.utils.ts` spells out at length: a calendar day in Armenia is a
 * *label* that a UTC server and a per-day counter must agree on, and passing
 * `Date` objects around is exactly how an event at `23:30+04:00` lands in the
 * previous day's bucket.
 *
 * Takes the instant rather than reading the clock, so callers that need to be
 * testable can hand it one.
 */
export function armeniaDateKey(instant: Date): string {
  return dateKeyFormatter.format(instant)
}
