/**
 * The event taxonomy itself lives in Prisma (see schema.prisma
 * `enum AnalyticsEventType`) — re-exported here so nothing inside this module
 * has to import from `@prisma/client` directly and every analytics enum has
 * one import site.
 */
export { AnalyticsEventType, SiteEventType } from '@prisma/client'

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
  /**
   * The Armenia calendar day in progress right now — a 1-day window, not
   * "the last 24 hours" (see `AnalyticsClock.resolveRange`, which treats
   * every period this way: whole calendar days, inclusive, ending today).
   *
   * Currently offered only by the admin's site-wide panel
   * (`SiteAnalyticsPanel.vue`) — the driver-facing dashboard's own period
   * switcher (`ANALYTICS_PERIOD_OPTIONS`) deliberately does not list it. The
   * enum itself stays one shared closed set rather than forking a second one
   * for that one panel; a value existing here does not by itself put it in
   * front of anyone — each caller curates its own options list.
   */
  Today = 'TODAY',
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
