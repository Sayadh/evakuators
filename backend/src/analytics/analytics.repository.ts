import { Injectable } from '@nestjs/common'
import { AnalyticsEventType as PrismaAnalyticsEventType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { AnalyticsEventType } from './analytics.enums'
import type {
  AnalyticsDailyStatRow,
  AnalyticsEventRecord,
  AnalyticsEventTypeSumRow,
} from './analytics.types'
import { AnalyticsDateKey, dateKeyToDate } from './analytics.utils'

/**
 * All analytics database access lives here — services never touch Prisma
 * directly (same rule as TowTrucksRepository / FreeRoutesRepository).
 */
/**
 * The event types that trigger a driver Telegram notice — kept next to the
 * query that counts them, and matching CONTACT_MESSAGES in
 * DriverNotificationService (the only place that decides what gets sent).
 */
const CONTACT_EVENT_TYPES: PrismaAnalyticsEventType[] = [
  PrismaAnalyticsEventType.PHONE_CLICK,
  PrismaAnalyticsEventType.WHATSAPP_CLICK,
]

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The write path. One SQL statement, two tables, zero race conditions.
   *
   * ## Why this is raw SQL and not two Prisma calls
   *
   * The rule "a visitor may bump a counter at most once per calendar day" is a
   * read-then-write decision, and the obvious implementations are all broken
   * under concurrency:
   *
   * - `findUnique` then `create` → two requests from the same visitor
   *   (double-click, two tabs, a retry) both read "not counted yet" and both
   *   increment. Classic lost-update, and it is not rare: it happens exactly
   *   when a user impatiently taps "Զանգահարել" twice.
   * - Prisma `upsert` → still resolves to a select-then-write for composite
   *   unique keys and does not give us "increment only if the dedup insert was
   *   actually new".
   * - Wrapping the two calls in a transaction → serialises nothing by itself;
   *   at the default READ COMMITTED isolation both transactions still see "no
   *   row" and one of them fails on the unique constraint *after* having
   *   already incremented the counter, so you either lose the event or
   *   double-count it depending on the order of statements.
   *
   * Instead, the dedup INSERT and the counter UPSERT are chained through a
   * data-modifying CTE:
   *
   * 1. Insert the (truck, day, event, visitor) row, `ON CONFLICT DO NOTHING`.
   *    The unique index makes this the arbiter — the database, not the app,
   *    decides who wins. Exactly one concurrent request gets a `RETURNING` row.
   * 2. The aggregate INSERT selects `FROM new_visitor_day`, so it runs zero
   *    times when the visitor already counted today, and once when they didn't.
   *    `ON CONFLICT ... DO UPDATE SET eventCount = eventCount + 1` makes the
   *    increment itself atomic (a single row-locked update, no read-back).
   *
   * Both statements are one atomic unit — a single statement is implicitly its
   * own transaction, so a crash can never leave a dedup row without its
   * counter, or vice versa. No explicit `$transaction`, no retry loop, no
   * advisory lock, one network round-trip.
   *
   * @returns true if this event was counted, false if the visitor had already
   *          triggered it today (the caller does not need to care, but it makes
   *          the behaviour testable and greppable in logs).
   */
  async recordEvent(event: AnalyticsEventRecord): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      WITH new_visitor_day AS (
        INSERT INTO "AnalyticsVisitorDay" ("towTruckId", "statDate", "eventType", "visitorKey")
        VALUES (
          ${event.towTruckId},
          ${event.statDate}::date,
          ${event.eventType}::"AnalyticsEventType",
          ${event.visitorKey}
        )
        ON CONFLICT ("towTruckId", "statDate", "eventType", "visitorKey") DO NOTHING
        RETURNING 1 AS counted
      )
      INSERT INTO "AnalyticsDailyStat" ("towTruckId", "statDate", "eventType", "eventCount", "createdAt", "updatedAt")
      SELECT
        ${event.towTruckId},
        ${event.statDate}::date,
        ${event.eventType}::"AnalyticsEventType",
        1,
        NOW(),
        NOW()
      FROM new_visitor_day
      ON CONFLICT ("towTruckId", "statDate", "eventType")
      DO UPDATE SET
        "eventCount" = "AnalyticsDailyStat"."eventCount" + 1,
        "updatedAt" = NOW()
    `
    return affected > 0
  }

  /**
   * How many contact events this truck has already had counted today.
   *
   * Reads only the aggregate table, straight off the
   * (towTruckId, statDate, eventType) unique index — at most two rows, and the
   * dedup ledger is never touched. Used to bound driver notifications
   * (see AnalyticsTrackingService.track) without introducing a second source
   * of truth for "how much happened today".
   */
  async countContactEventsOnDay(
    towTruckId: number,
    statDate: AnalyticsDateKey,
  ): Promise<number> {
    const result = await this.prisma.analyticsDailyStat.aggregate({
      where: {
        towTruckId,
        statDate: dateKeyToDate(statDate),
        eventType: { in: CONTACT_EVENT_TYPES },
      },
      _sum: { eventCount: true },
    })
    return result._sum?.eventCount ?? 0
  }

  /**
   * Per-event-type totals, optionally windowed. Reads ONLY the aggregate table,
   * so cost is proportional to (days in range × event types present) — at most
   * 450 rows for the widest 90-day period — not to the number of events ever
   * recorded. Postgres serves it from the
   * (towTruckId, statDate, eventType) unique index.
   *
   * Omitting the range gives the all-time figures, which is cheap for the same
   * reason: three years of one truck's traffic is ~5k index entries.
   */
  async sumByEventType(
    towTruckId: number,
    range?: { from: AnalyticsDateKey; to: AnalyticsDateKey },
  ): Promise<AnalyticsEventTypeSumRow[]> {
    const where: Prisma.AnalyticsDailyStatWhereInput = {
      towTruckId,
      ...(range
        ? {
            statDate: {
              gte: dateKeyToDate(range.from),
              lte: dateKeyToDate(range.to),
            },
          }
        : {}),
    }

    const rows = await this.prisma.analyticsDailyStat.groupBy({
      by: ['eventType'],
      where,
      _sum: { eventCount: true },
    })

    return rows.map((row) => ({
      eventType: row.eventType,
      total: row._sum.eventCount ?? 0,
    }))
  }

  /**
   * Distinct visitors in a window — deliberately NOT the sum of daily
   * PAGE_VIEW counts. Someone who visits on Monday and again on Friday is two
   * page views but one unique visitor, and only a `COUNT(DISTINCT …)` over the
   * whole window can say that.
   *
   * Raw SQL because Prisma has no `distinct` aggregate: the alternative
   * (`groupBy({ by: ['visitorKey'] })` and counting the array) would stream
   * every visitor key of the period into Node just to take its length.
   *
   * This is an index-only scan on
   * (towTruckId, statDate, eventType, visitorKey) — the dedup index — which is
   * exactly why visitorKey is its last column.
   */
  async countUniqueVisitors(
    towTruckId: number,
    eventType: AnalyticsEventType,
    range: { from: AnalyticsDateKey; to: AnalyticsDateKey },
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT "visitorKey")::int AS "count"
      FROM "AnalyticsVisitorDay"
      WHERE "towTruckId" = ${towTruckId}
        AND "eventType" = ${eventType}::"AnalyticsEventType"
        AND "statDate" BETWEEN ${range.from}::date AND ${range.to}::date
    `
    return rows[0]?.count ?? 0
  }

  /**
   * Raw daily rows for the chart. Only the three columns the chart needs — no
   * `select: *`, so wide-row reads never creep in as the table gains columns.
   */
  findDailyStats(
    towTruckId: number,
    range: { from: AnalyticsDateKey; to: AnalyticsDateKey },
  ): Promise<AnalyticsDailyStatRow[]> {
    return this.prisma.analyticsDailyStat.findMany({
      where: {
        towTruckId,
        statDate: { gte: dateKeyToDate(range.from), lte: dateKeyToDate(range.to) },
      },
      select: { statDate: true, eventType: true, eventCount: true },
      orderBy: { statDate: 'asc' },
    })
  }

  /**
   * Retention purge for the dedup ledger (the only analytics table that grows
   * with traffic). Uses the standalone `statDate` index — the unique index is
   * useless here because it leads with towTruckId and this filter spans every
   * tow truck.
   */
  async purgeVisitorDaysBefore(cutoff: AnalyticsDateKey): Promise<number> {
    const result = await this.prisma.analyticsVisitorDay.deleteMany({
      where: { statDate: { lt: dateKeyToDate(cutoff) } },
    })
    return result.count
  }
}
