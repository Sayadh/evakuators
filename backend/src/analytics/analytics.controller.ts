import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AnalyticsTrackingService } from './analytics-tracking.service'
import { ANALYTICS_TRACK_RATE_LIMIT } from './analytics.constants'
import { TrackEventDto } from './dto/track-event.dto'
import { TrackSiteEventDto } from './dto/track-site-event.dto'

/**
 * The only public, unauthenticated route in this module — anonymous visitors
 * are precisely who we are measuring, so requiring auth is not an option.
 *
 * Three things keep it from being an abuse vector:
 *
 * 1. **The dedup constraint.** Even unlimited requests cannot inflate a number,
 *    because the second event of the day for a given visitor is a no-op at the
 *    database level. Spam costs write attempts, never wrong statistics.
 * 2. **A stricter throttle** than the global default, to protect the database
 *    from those write attempts.
 * 3. **A blind response.** 202 with an empty body regardless of whether the
 *    event counted, was a same-day duplicate, or targeted a deactivated truck.
 *    Reporting "duplicate" would turn this endpoint into an oracle for "has
 *    this visitor id been here today", which is a privacy leak about other
 *    people's browsing, and reporting "deactivated" would leak moderation state.
 *    Only a genuinely unknown towTruckId returns 404, and truck ids are already
 *    public via GET /tow-trucks.
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly trackingService: AnalyticsTrackingService) {}

  @Throttle({ default: ANALYTICS_TRACK_RATE_LIMIT })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('events')
  async track(@Body() dto: TrackEventDto): Promise<void> {
    await this.trackingService.track(dto)
  }

  /**
   * Site-wide traffic (admin panel), same three protections as above.
   *
   * Even blinder than its sibling: there is no target id, so not even a 404 can
   * leak from here. The response is 202 and empty whether the event counted or
   * was the same visitor's second visit today.
   */
  @Throttle({ default: ANALYTICS_TRACK_RATE_LIMIT })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('site-events')
  async trackSite(@Body() dto: TrackSiteEventDto): Promise<void> {
    await this.trackingService.trackSite(dto)
  }
}
