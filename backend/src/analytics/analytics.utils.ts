import { ANALYTICS_TIMEZONE } from './analytics.constants'

/**
 * Pure, dependency-free date helpers. No `new Date()` in here — every function
 * takes the "now" it needs, which is what makes the whole date layer testable
 * and keeps AnalyticsClock the single place that reads the system clock.
 *
 * ## Why a "date key" and not a Date
 *
 * A calendar day in Armenia is not a `Date`; it's a label ("2026-07-27") that
 * a UTC-running server, a Postgres DATE column and a chart axis must all agree
 * on. Passing `Date` objects around invites exactly the class of bug where a
 * `2026-07-27T23:30:00+04:00` event lands in the 2026-07-26 bucket. So the
 * canonical currency of this module is the string `YYYY-MM-DD`, and it is
 * converted to a Date only at the Prisma boundary.
 */

/** `YYYY-MM-DD` — an Armenia-local calendar day. Format used end to end. */
export type AnalyticsDateKey = string

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * `en-CA` is not a stylistic choice: it is the locale whose short date format
 * is exactly ISO `YYYY-MM-DD`, which lets us get a timezone-correct calendar
 * date out of the ICU database without any manual offset arithmetic.
 */
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Which Armenia calendar day does this instant fall on? */
export function toAnalyticsDateKey(instant: Date): AnalyticsDateKey {
  return dateKeyFormatter.format(instant)
}

/**
 * Date key → the value stored in a Postgres `DATE` column. Prisma sends
 * `@db.Date` fields as date-only, so the UTC midnight instant here never
 * shifts the stored day regardless of the server's own timezone.
 */
export function dateKeyToDate(key: AnalyticsDateKey): Date {
  if (!DATE_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid analytics date key: ${key}`)
  }
  return new Date(`${key}T00:00:00.000Z`)
}

/** Inverse of dateKeyToDate — used when mapping rows back out of Postgres */
export function dateToDateKey(value: Date): AnalyticsDateKey {
  return value.toISOString().slice(0, 10)
}

/** Shift a date key by whole days (negative shifts backwards) */
export function shiftDateKey(key: AnalyticsDateKey, days: number): AnalyticsDateKey {
  return dateToDateKey(new Date(dateKeyToDate(key).getTime() + days * MS_PER_DAY))
}

/**
 * Every date key from `from` to `to`, inclusive, ascending. The chart endpoint
 * uses this to zero-fill days with no traffic: without it, a driver with
 * traffic only on Monday and Friday would get a two-point chart that silently
 * misrepresents the week.
 */
export function buildDateKeyRange(
  from: AnalyticsDateKey,
  to: AnalyticsDateKey,
): AnalyticsDateKey[] {
  const keys: AnalyticsDateKey[] = []
  const lastMs = dateKeyToDate(to).getTime()
  for (let ms = dateKeyToDate(from).getTime(); ms <= lastMs; ms += MS_PER_DAY) {
    keys.push(dateToDateKey(new Date(ms)))
  }
  return keys
}
