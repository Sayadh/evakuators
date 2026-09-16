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

/**
 * The same formatter, but with the clock fields too — used to read what wall
 * time Armenia is showing at a given instant, which is how the UTC offset is
 * derived below instead of being hardcoded.
 */
const zonedPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** How far ahead of UTC Armenia is at this instant, in milliseconds */
function zoneOffsetMs(instant: Date): number {
  const parts = new Map(zonedPartsFormatter.formatToParts(instant).map((p) => [p.type, p.value]))
  const hour = Number(parts.get('hour'))
  return (
    Date.UTC(
      Number(parts.get('year')),
      Number(parts.get('month')) - 1,
      Number(parts.get('day')),
      // ICU spells midnight as 24 under hour12: false in some versions.
      hour === 24 ? 0 : hour,
      Number(parts.get('minute')),
      Number(parts.get('second')),
    ) - instant.getTime()
  )
}

/**
 * Date key → the instant that Armenia calendar day actually begins.
 *
 * NOT the same thing as `dateKeyToDate` above, and the difference is the whole
 * reason this exists. That one is for `@db.Date` columns, where the stored
 * value is a day label and UTC midnight is merely how Prisma spells it. A
 * `DateTime` column holds a real instant: a referral logged at 01:00 on the
 * 16th Armenia time is `2026-09-15T21:00Z`, so filtering it with
 * `>= 2026-09-16T00:00Z` would file it under the 15th and quietly drop it out
 * of the day the operator remembers making it.
 *
 * The offset is read from the IANA database rather than written as +04:00.
 * Armenia has had no DST since 2012, so the constant would be right today —
 * but it is right by circumstance, and the day that changes is not a day
 * anyone would think to come back and check this line.
 */
export function dateKeyToInstant(key: AnalyticsDateKey): Date {
  const asIfUtc = dateKeyToDate(key)
  return new Date(asIfUtc.getTime() - zoneOffsetMs(asIfUtc))
}

/**
 * An inclusive date-key window → the half-open instant range covering it.
 *
 * Half-open (`gte`/`lt`) rather than inclusive on both ends because the end is
 * a whole day: the alternative is "23:59:59.999 on the last day", which is a
 * millisecond away from wrong and gets copied. `lt` is simply where the next
 * day starts.
 */
export function dateKeyRangeToInstants(
  from: AnalyticsDateKey,
  to: AnalyticsDateKey,
): { gte: Date; lt: Date } {
  return { gte: dateKeyToInstant(from), lt: dateKeyToInstant(shiftDateKey(to, 1)) }
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
