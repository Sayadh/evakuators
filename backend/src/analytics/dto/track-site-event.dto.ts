import { IsEnum, IsString, IsUUID, MaxLength } from 'class-validator'
import { ANALYTICS_VISITOR_ID_MAX_LENGTH } from '../analytics.constants'
import { SiteEventType } from '../analytics.enums'

/**
 * Body of POST /analytics/site-events.
 *
 * The per-truck twin (TrackEventDto) minus `towTruckId` — there is no target to
 * name, the site is the target. Everything else is identical on purpose,
 * including what is deliberately absent: no date, no counter. The client says
 * *what happened, as whom*; when it happened and whether it counts is decided
 * server-side (see AnalyticsEventFactory).
 */
export class TrackSiteEventDto {
  @IsEnum(SiteEventType)
  eventType!: SiteEventType

  /** Same opaque browser UUID the per-truck events use — one visitor identity site-wide */
  @IsString()
  @MaxLength(ANALYTICS_VISITOR_ID_MAX_LENGTH)
  @IsUUID('4')
  visitorId!: string
}
