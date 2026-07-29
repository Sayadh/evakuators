import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { SiteEventType } from './analytics.enums'
import type { SiteEventRecord, SiteEventTypeSumRow } from './analytics.types'
import { AnalyticsDateKey, dateKeyToDate } from './analytics.utils'

/**
 * Site-wide traffic storage — the admin panel's half of this module.
 *
 * Everything here is the per-tow-truck design (see AnalyticsRepository) with the
 * truck taken out; read that file first, its comments explain *why* each piece
 * looks like this. The duplication is deliberate and small: the alternative was
 * one nullable `towTruckId` threaded through both unique constraints and every
 * driver-facing query, where `NULL` would silently mean "not a driver's number"
 * in code that has no idea that case exists.
 */
@Injectable()
export class SiteAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The write path, in one statement. Identical CTE trick to
   * `AnalyticsRepository.recordEvent()`:
   *
   * 1. Insert the (day, event, visitor) dedup row, `ON CONFLICT DO NOTHING` —
   *    the unique index decides who wins, not the application.
   * 2. The counter INSERT selects `FROM new_visitor_day`, so it runs exactly
   *    once when the row was new and zero times when it wasn't.
   *
   * This is what makes "how many people visited the site" mean *people* rather
   * than page loads: a visitor reloading the homepage forty times moves the
   * counter once. Without it, the number would be a refresh count wearing a
   * visitor count's label.
   *
   * @returns true when this event actually moved a counter.
   */
  async recordEvent(event: SiteEventRecord): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      WITH new_visitor_day AS (
        INSERT INTO "SiteVisitorDay" ("statDate", "eventType", "visitorKey")
        VALUES (
          ${event.statDate}::date,
          ${event.eventType}::"SiteEventType",
          ${event.visitorKey}
        )
        ON CONFLICT ("statDate", "eventType", "visitorKey") DO NOTHING
        RETURNING 1 AS counted
      )
      INSERT INTO "SiteDailyStat" ("statDate", "eventType", "eventCount", "createdAt", "updatedAt")
      SELECT
        ${event.statDate}::date,
        ${event.eventType}::"SiteEventType",
        1,
        NOW(),
        NOW()
      FROM new_visitor_day
      ON CONFLICT ("statDate", "eventType")
      DO UPDATE SET
        "eventCount" = "SiteDailyStat"."eventCount" + 1,
        "updatedAt" = NOW()
    `
    return affected > 0
  }

  /**
   * Per-event-type totals, optionally windowed. Reads only the aggregate table,
   * so cost is (days in range × event types) — at most 180 rows for the widest
   * period, regardless of how much traffic the site has ever had.
   */
  async sumByEventType(range?: {
    from: AnalyticsDateKey
    to: AnalyticsDateKey
  }): Promise<SiteEventTypeSumRow[]> {
    const where: Prisma.SiteDailyStatWhereInput = range
      ? { statDate: { gte: dateKeyToDate(range.from), lte: dateKeyToDate(range.to) } }
      : {}

    const rows = await this.prisma.siteDailyStat.groupBy({
      by: ['eventType'],
      where,
      _sum: { eventCount: true },
    })

    return rows.map((row) => ({ eventType: row.eventType, total: row._sum.eventCount ?? 0 }))
  }

  /**
   * Distinct visitors in a window — deliberately NOT the sum of the daily
   * counts above. Someone who comes back on three different days is three
   * daily visits but one person, and only a `COUNT(DISTINCT …)` over the whole
   * window can say that.
   *
   * Raw SQL because Prisma has no distinct aggregate; index-only on
   * (statDate, eventType, visitorKey), which is why visitorKey is last.
   */
  async countUniqueVisitors(
    eventType: SiteEventType,
    range: { from: AnalyticsDateKey; to: AnalyticsDateKey },
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT "visitorKey")::int AS "count"
      FROM "SiteVisitorDay"
      WHERE "eventType" = ${eventType}::"SiteEventType"
        AND "statDate" BETWEEN ${range.from}::date AND ${range.to}::date
    `
    return rows[0]?.count ?? 0
  }

  /** Retention purge for the dedup ledger — same rule and same cron as the per-truck one */
  async purgeVisitorDaysBefore(cutoff: AnalyticsDateKey): Promise<number> {
    const result = await this.prisma.siteVisitorDay.deleteMany({
      where: { statDate: { lt: dateKeyToDate(cutoff) } },
    })
    return result.count
  }
}
