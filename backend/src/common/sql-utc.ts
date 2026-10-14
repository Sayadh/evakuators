import { Prisma } from '@prisma/client'

/**
 * An instant as a SQL `timestamp` in UTC — for raw SQL that compares against or
 * writes a Prisma `DateTime` column.
 *
 * ## Why a raw `${date}` is wrong here
 *
 * Prisma stores `DateTime` as `timestamp(3)` WITHOUT a time zone, holding the
 * UTC wall clock. In a raw query a bound `Date` arrives as `timestamptz`, and
 * Postgres turns it into a plain `timestamp` using the SESSION's `TimeZone` —
 * so on a server whose Postgres runs in `Asia/Yerevan` every comparison is
 * four hours off and every written date is shifted by four hours. Verified
 * against PostgreSQL 16: a placement ending at 12:00 UTC read as already over
 * at 10:00 UTC, and a one-day grant landed at 14:00 the next day.
 *
 * `AT TIME ZONE 'UTC'` makes the conversion explicit, so the answer is the
 * same whatever the server is configured with. Prisma's own (non-raw) queries
 * already behave this way, which is why only raw SQL needs it.
 */
export function sqlUtc(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`
}
