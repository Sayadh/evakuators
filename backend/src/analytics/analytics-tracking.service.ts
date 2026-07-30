import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DriverNotificationService } from '../telegram/driver-notification.service'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { AnalyticsClock } from './analytics-clock.service'
import { AnalyticsEventFactory } from './analytics-event.factory'
import {
  ANALYTICS_PURGE_CRON,
  ANALYTICS_VISITOR_DAY_RETENTION_DAYS,
  CONTACT_NOTICE_DAILY_LIMIT,
} from './analytics.constants'
import type { AnalyticsDateKey } from './analytics.utils'
import { AnalyticsRepository } from './analytics.repository'
import { SiteAnalyticsRepository } from './site-analytics.repository'
import type { TrackEventDto } from './dto/track-event.dto'
import type { TrackSiteEventDto } from './dto/track-site-event.dto'

/**
 * The WRITE half of the module. Owns exactly two things: turning a tracking
 * request into a counted event, and keeping the dedup ledger from growing
 * forever. It deliberately knows nothing about dashboards, periods or
 * aggregation — that is AnalyticsDashboardService's job. Splitting read from
 * write matters here because the two halves have opposite characteristics: this
 * one is high-frequency, fire-and-forget and must never block a visitor; the
 * other is low-frequency, authenticated and query-heavy.
 */
@Injectable()
export class AnalyticsTrackingService {
  private readonly logger = new Logger(AnalyticsTrackingService.name)

  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly siteAnalyticsRepository: SiteAnalyticsRepository,
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly eventFactory: AnalyticsEventFactory,
    private readonly clock: AnalyticsClock,
    private readonly driverNotification: DriverNotificationService,
  ) {}

  /**
   * Records a site-wide interaction — "someone opened the site", "someone
   * opened /free-routes" — at most once per Armenia calendar day per visitor.
   *
   * Much simpler than track() below because there is no target to validate:
   * the site always exists, so there is no 404 case and nothing to check for
   * being deactivated. The dedup constraint does the rest.
   */
  async trackSite(dto: TrackSiteEventDto): Promise<boolean> {
    return this.siteAnalyticsRepository.recordEvent(this.eventFactory.createSite(dto))
  }

  /**
   * Records one visitor interaction, at most once per Armenia calendar day per
   * (visitor, tow truck, event type).
   *
   * Order of operations is a security decision:
   * 1. Verify the target exists and is active. A deactivated or deleted truck
   *    accepts no events — otherwise a banned profile would keep accruing
   *    statistics, and rows would exist for trucks nobody can see.
   * 2. Only then build the record, which is where the server (not the client)
   *    stamps the calendar day and hashes the visitor id.
   * 3. Hand it to the repository, whose single SQL statement does the dedup.
   *
   * @returns whether the event actually moved a counter — the controller
   *          intentionally does not expose this (see AnalyticsController).
   */
  async track(dto: TrackEventDto): Promise<boolean> {
    const towTruck = await this.towTrucksRepository.findStatusById(dto.towTruckId)
    if (!towTruck) {
      throw new NotFoundException('Էվակուատորը չի գտնվել')
    }
    // Not an error for the visitor — the profile simply isn't collecting
    // statistics any more. Silently ignoring keeps a deactivated profile from
    // leaking its state to anonymous clients through a distinguishable error.
    if (!towTruck.isActive) return false

    const event = this.eventFactory.create(towTruck.id, dto)
    const counted = await this.analyticsRepository.recordEvent(event)

    // Only on a counted event, never on a duplicate. That single condition is
    // the whole rate control for driver notices: the dedup constraint already
    // collapses one visitor's repeated taps within a calendar day into one
    // event, so a driver gets one message per genuinely interested person
    // rather than one per finger — no throttle of its own needed, and none
    // wanted, since suppressing a second real caller would be exactly the
    // attribution failure the feature exists to prevent.
    //
    // Deliberately not awaited: this is the anonymous write path, and the
    // visitor who just pressed "call" is being handed off to the dialer right
    // now. The service swallows its own errors, so there is nothing to catch.
    if (counted) {
      void this.notifyWithinDailyLimit(towTruck.id, event.statDate, dto.eventType)
    }

    return counted
  }

  /**
   * Sends the driver notice unless this truck has already had its day's worth.
   *
   * The counter it reads is the aggregate row `recordEvent()` has just
   * incremented, so the event being handled is itself included — which makes
   * `<=` the inclusive form of the limit. Reading it rather than keeping a
   * counter in memory means the limit survives a restart and stays correct on
   * the Armenia calendar day the event was actually stamped with.
   *
   * Never throws: this is called without await from the anonymous write path,
   * exactly like the notification service it wraps.
   */
  private async notifyWithinDailyLimit(
    towTruckId: number,
    statDate: AnalyticsDateKey,
    eventType: TrackEventDto['eventType'],
  ): Promise<void> {
    try {
      const todayCount = await this.analyticsRepository.countContactEventsOnDay(
        towTruckId,
        statDate,
      )

      if (todayCount <= CONTACT_NOTICE_DAILY_LIMIT) {
        await this.driverNotification.notifyContactIntent(towTruckId, eventType)
        return
      }

      // Logged once per truck per day — on the first event past the limit —
      // so a driver who genuinely is that busy is visible in the logs without
      // the log line becoming the very flood it reports.
      if (todayCount === CONTACT_NOTICE_DAILY_LIMIT + 1) {
        this.logger.warn(
          `Contact notices for TowTruck #${towTruckId} reached the daily limit ` +
            `(${CONTACT_NOTICE_DAILY_LIMIT}) on ${statDate}; further notices suppressed ` +
            'until tomorrow. Statistics are unaffected.',
        )
      }
    } catch (error) {
      this.logger.warn(
        `Contact notice gate failed for TowTruck #${towTruckId}: ${String(error)}`,
      )
    }
  }

  /**
   * Nightly retention purge for AnalyticsVisitorDay.
   *
   * This is the only table in the module that scales with traffic
   * (visitors × event types × days), and it exists purely to answer two
   * questions: "has this visitor already counted today?" and "how many distinct
   * visitors in the selected period?". Neither question can reach further back
   * than the longest selectable period, so anything older than
   * ANALYTICS_VISITOR_DAY_RETENTION_DAYS is dead weight.
   *
   * The aggregate table is NOT touched — a driver keeps their full historical
   * counters forever; only the ability to de-duplicate visitors across ancient
   * windows is dropped.
   */
  @Cron(ANALYTICS_PURGE_CRON)
  async purgeExpiredVisitorDays(): Promise<void> {
    const cutoff = this.clock.retentionCutoff(ANALYTICS_VISITOR_DAY_RETENTION_DAYS)
    // Both ledgers, one job and one cutoff — they are the same mechanism with
    // the same retention rule, and two crons that can drift apart would let one
    // table's unique-visitor window quietly outlive the other's.
    const [perTruck, site] = await Promise.all([
      this.analyticsRepository.purgeVisitorDaysBefore(cutoff),
      this.siteAnalyticsRepository.purgeVisitorDaysBefore(cutoff),
    ])
    if (perTruck > 0 || site > 0) {
      this.logger.log(
        `Analytics retention: purged ${perTruck} tow-truck and ${site} site visitor-day rows older than ${cutoff}`,
      )
    }
  }
}
