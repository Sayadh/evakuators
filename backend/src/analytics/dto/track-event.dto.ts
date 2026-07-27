import { IsEnum, IsInt, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator'
import { ANALYTICS_VISITOR_ID_MAX_LENGTH } from '../analytics.constants'
import { AnalyticsEventType } from '../analytics.enums'

/**
 * Body of POST /analytics/events — the only untrusted input in this module.
 *
 * Note what is deliberately NOT here: no date, no counter, no "visits" number.
 * The client says *what happened to whom, as whom*; when it happened and how
 * much it counts for are decided server-side (see AnalyticsEventFactory).
 * `forbidNonWhitelisted` in main.ts means sending any extra field is a 400
 * rather than a silently ignored attempt.
 */
export class TrackEventDto {
  /**
   * Public primary key of the tow truck whose profile is being interacted with.
   * Already exposed by GET /tow-trucks, and validated against the database
   * before anything is written — an id for a missing or deactivated truck is a
   * 404, not a stray row.
   */
  @IsInt()
  @IsPositive()
  towTruckId!: number

  @IsEnum(AnalyticsEventType)
  eventType!: AnalyticsEventType

  /**
   * Opaque, browser-generated UUID v4 (see frontend utils/visitorId.ts).
   * Validated as a real v4 rather than any string so that a client cannot pass
   * a huge or attacker-chosen value — the length cap is belt-and-braces for
   * the same reason. The server hashes it before storage and never sets it, so
   * clearing cookies/storage legitimately makes the browser a new visitor.
   */
  @IsString()
  @MaxLength(ANALYTICS_VISITOR_ID_MAX_LENGTH)
  @IsUUID('4')
  visitorId!: string
}
