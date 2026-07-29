import { Injectable } from '@nestjs/common'
import { AnalyticsClock } from './analytics-clock.service'
import { AnalyticsVisitorKeyService } from './analytics-visitor-key.service'
import type { AnalyticsEventRecord, SiteEventRecord } from './analytics.types'
import type { TrackEventDto } from './dto/track-event.dto'
import type { TrackSiteEventDto } from './dto/track-site-event.dto'

/**
 * The anti-corruption boundary between an HTTP request and the database.
 *
 * Two of the four fields on an AnalyticsEventRecord must NOT come from the
 * client, and this is the one place that guarantees it:
 *
 * - `statDate` is resolved from the server clock in Armenia time. If the client
 *   supplied it, a visitor could pick a fresh date on every request and defeat
 *   the once-per-day rule entirely (the dedup unique key includes the date).
 * - `visitorKey` is the hashed form; the raw id never travels further into the
 *   system than this method.
 *
 * `towTruckId` is passed in by the tracking service *after* it has verified the
 * tow truck exists and is active — the factory never resolves it itself, which
 * keeps "is this a legitimate target" and "what does the row look like" as two
 * separate responsibilities.
 */
@Injectable()
export class AnalyticsEventFactory {
  constructor(
    private readonly clock: AnalyticsClock,
    private readonly visitorKey: AnalyticsVisitorKeyService,
  ) {}

  create(towTruckId: number, dto: TrackEventDto): AnalyticsEventRecord {
    return {
      towTruckId,
      statDate: this.clock.today(),
      eventType: dto.eventType,
      visitorKey: this.visitorKey.hash(dto.visitorId),
    }
  }

  /**
   * Site-wide twin. Same two guarantees, and the same reason for existing: the
   * server decides the calendar day and does the hashing, so a client cannot
   * pick a fresh date per request and defeat the once-per-day rule.
   */
  createSite(dto: TrackSiteEventDto): SiteEventRecord {
    return {
      statDate: this.clock.today(),
      eventType: dto.eventType,
      visitorKey: this.visitorKey.hash(dto.visitorId),
    }
  }
}
