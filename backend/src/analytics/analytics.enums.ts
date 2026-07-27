/**
 * The event taxonomy itself lives in Prisma (see schema.prisma
 * `enum AnalyticsEventType`) — re-exported here so nothing inside this module
 * has to import from `@prisma/client` directly and every analytics enum has
 * one import site.
 */
export { AnalyticsEventType } from '@prisma/client'

/**
 * The only date ranges a dashboard can ask for. Deliberately a closed set
 * rather than free-form `from`/`to` query params:
 *
 * - it caps how much data a single request can scan (a hostile or buggy
 *   client can't ask for ten years of daily rows),
 * - it keeps `AnalyticsVisitorDay` retention (see
 *   ANALYTICS_VISITOR_DAY_RETENTION_DAYS) provably longer than the longest
 *   period a user can select, so the unique-visitors metric is never
 *   silently truncated by the purge cron,
 * - and it makes the response cacheable by a small, enumerable key.
 *
 * Values are the literal query-string values, so the DTO validates against
 * this enum directly.
 */
export enum AnalyticsPeriod {
  Last7Days = 'LAST_7_DAYS',
  Last30Days = 'LAST_30_DAYS',
  Last90Days = 'LAST_90_DAYS',
}

/** Which slice of a tow truck's reviews a dashboard is asking for */
export enum AnalyticsReviewStatus {
  Confirmed = 'CONFIRMED',
  Pending = 'PENDING',
  All = 'ALL',
}
