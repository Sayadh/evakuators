import { CronExpression } from '@nestjs/schedule'
import { AnalyticsEventType, AnalyticsPeriod } from './analytics.enums'

/**
 * Every tunable number and string in the analytics module lives here — nothing
 * in this feature hardcodes a literal inline. See docs/analytics.md.
 */

/**
 * The ONLY timezone this module knows about. "One calendar day" for the
 * once-per-visitor-per-day rule means 00:00–23:59 in Armenia, never a rolling
 * 24h window and never the server's local time (the VPS runs UTC, and a UTC
 * day boundary would reset a driver's stats at 04:00 Yerevan time).
 *
 * Asia/Yerevan is UTC+4 with no DST today, but this is resolved through the
 * ICU timezone database at runtime (see analytics.utils.ts) rather than a
 * hardcoded +4 offset — if Armenia ever reintroduces DST, nothing here changes.
 */
export const ANALYTICS_TIMEZONE = 'Asia/Yerevan'

/** How many calendar days (inclusive of today) each selectable period covers */
export const ANALYTICS_PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  [AnalyticsPeriod.Last7Days]: 7,
  [AnalyticsPeriod.Last30Days]: 30,
  [AnalyticsPeriod.Last90Days]: 90,
}

/** Used when a dashboard request omits `?period=` */
export const ANALYTICS_DEFAULT_PERIOD = AnalyticsPeriod.Last30Days

/**
 * "Unique visitors" is defined as distinct visitors who OPENED the profile —
 * a visitor who somehow triggered only a phone click without a page view
 * (impossible through the UI, possible through a crafted request) does not
 * invent a visitor. Keeping this a named constant means the definition lives
 * in one place instead of being implied by a query.
 */
export const ANALYTICS_UNIQUE_VISITOR_EVENT_TYPE = AnalyticsEventType.PAGE_VIEW

/**
 * How long the per-visitor dedup ledger is kept. MUST stay strictly greater
 * than the longest selectable period (90 days) — the unique-visitors metric
 * reads this table directly, so purging inside the selectable window would
 * make old unique counts silently shrink. The aggregate table
 * (AnalyticsDailyStat) is never purged; only this one grows with traffic.
 */
export const ANALYTICS_VISITOR_DAY_RETENTION_DAYS = 180

/** When the retention purge runs — off-peak, once a day is plenty */
export const ANALYTICS_PURGE_CRON = CronExpression.EVERY_DAY_AT_4AM

/**
 * Rate limit for the public tracking endpoint, overriding the global
 * 60 req/60s (see app.module.ts). A real visitor generates at most one
 * PAGE_VIEW plus four possible click events per profile they open, so 60/min
 * still covers someone rapidly comparing a dozen trucks, while a script
 * hammering the endpoint gets cut off early.
 *
 * Note this limit exists to protect the DATABASE, not the numbers: the dedup
 * constraint already makes repeat events from the same visitor no-ops, so
 * even an unthrottled flood cannot inflate a driver's statistics.
 */
export const ANALYTICS_TRACK_RATE_LIMIT = { limit: 60, ttl: 60_000 } as const

/**
 * Most contact notices a single driver can be sent in one Armenia calendar day.
 *
 * The analytics dedup constraint was the only rate control these notices had,
 * and against an honest browser it is a good one — one notice per genuinely
 * interested person. It is not one against an adversary: `visitorId` comes
 * from the request body (see TrackEventDto), so rotating it produces an
 * unlimited supply of "new visitors", each of which counts and each of which
 * fires a Telegram message. At the tracking endpoint's own rate limit that is
 * 60 messages a minute aimed at one driver.
 *
 * The consequence is worse than noise. These notices ride the SAME bot that
 * delivers login OTP codes (docs/auth-and-security.md), so a flood risks
 * Telegram throttling or flagging the bot — which takes driver logins down
 * with it. That is the project's own stated top operational risk.
 *
 * 20 is chosen to sit far above a real day's interested callers and far below
 * the volume at which the bot is at risk. It bounds ONLY the Telegram
 * messages: every event is still counted in full, so the dashboards a driver
 * and an admin see are unaffected by this number.
 */
export const CONTACT_NOTICE_DAILY_LIMIT = 20

/** Longest accepted raw visitor id — a UUID v4 is 36 chars; anything longer is junk */
export const ANALYTICS_VISITOR_ID_MAX_LENGTH = 64

/** Page size for the dashboard's review list */
export const ANALYTICS_REVIEWS_DEFAULT_LIMIT = 20
export const ANALYTICS_REVIEWS_MAX_LIMIT = 100

/** Valid star ratings, low → high — drives the rating-distribution histogram */
export const ANALYTICS_RATING_VALUES = [1, 2, 3, 4, 5] as const

/**
 * Cache key builders. Nothing caches today (single PM2 instance, and a driver
 * refreshing right after a page view expects to see it) — these exist so that
 * when a Redis cache is introduced the key format is decided in exactly one
 * place instead of being invented at each call site. See docs/analytics.md
 * § "Production recommendations".
 */
export const ANALYTICS_CACHE_KEYS = {
  overview: (towTruckId: number, period: AnalyticsPeriod): string =>
    `analytics:overview:${towTruckId}:${period}`,
  charts: (towTruckId: number, period: AnalyticsPeriod): string =>
    `analytics:charts:${towTruckId}:${period}`,
} as const

/** TTL to use for the keys above once caching is switched on */
export const ANALYTICS_CACHE_TTL_MS = 60_000
