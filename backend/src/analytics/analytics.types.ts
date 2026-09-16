import type { AnalyticsEventType, AnalyticsPeriod, SiteEventType } from './analytics.enums'
import type { AnalyticsDateKey } from './analytics.utils'

/**
 * One fully-resolved, trusted event, ready to be written. Produced only by
 * AnalyticsEventFactory — services and the repository never assemble this
 * shape themselves, so there is exactly one place where an untrusted request
 * becomes a domain object (see analytics-event.factory.ts).
 */
export interface AnalyticsEventRecord {
  towTruckId: number
  /** Armenia calendar day, resolved server-side — never taken from the client */
  statDate: AnalyticsDateKey
  eventType: AnalyticsEventType
  /** sha256(rawVisitorId + pepper) — the raw id never reaches the repository */
  visitorKey: string
}

/** Counter per event type. Always has all five keys, zero-filled. */
export type AnalyticsEventTotals = Record<AnalyticsEventType, number>

/** The resolved date window a dashboard response describes */
export interface AnalyticsRangeApi {
  period: AnalyticsPeriod
  /** Inclusive, `YYYY-MM-DD`, Armenia calendar */
  from: AnalyticsDateKey
  to: AnalyticsDateKey
  days: number
}

export interface AnalyticsReviewCountersApi {
  /** Approved by an admin — publicly visible on the profile */
  confirmed: number
  /** Submitted but not yet moderated */
  pending: number
  total: number
}

export interface AnalyticsRatingCountersApi {
  confirmed: number
  pending: number
  /** Mean star rating of approved reviews, rounded to 1 decimal. Null when none. */
  confirmedAverage: number | null
  /** Mean star rating of not-yet-approved reviews. Null when none. */
  pendingAverage: number | null
}

/**
 * Jobs the dispatcher actually passed to this driver.
 *
 * Deliberately NOT an `AnalyticsEventType`. Everything in `totals` is written
 * through the visitor-event pipeline and deduplicated to once per visitor per
 * Armenia day (see docs/analytics.md) — which is the right rule for "somebody
 * looked at your page" and the wrong one here. A referral is not a visitor
 * action at all: it is an operator handing over a job, each one is a separate
 * job, and two in one day must read as two. Pushing it through that pipeline
 * would silently collapse them, and would also invent a "unique visitors"
 * reading for a number that has no visitors in it.
 *
 * So it is counted straight off `DispatchReferral`, the row the dispatch
 * screen already writes as the authoritative record, exactly as `reviews` and
 * `ratings` below are counted off `Review`.
 */
export interface AnalyticsDispatchCountersApi {
  /** Referrals inside the selected period */
  period: number
  /** Over the driver's whole history — referral rows are never purged */
  allTime: number
  /** ISO datetime of the most recent one; absent when there has never been one */
  lastDispatchedAt?: string
}

/** GET /my/analytics — the overview cards + customer-activity block */
export interface AnalyticsOverviewApi {
  range: AnalyticsRangeApi
  /** Deduplicated counts inside the selected period */
  totals: AnalyticsEventTotals
  /** Distinct visitors inside the selected period (not a sum of daily uniques) */
  uniqueVisitors: number
  /** Same counters over the tow truck's whole history — never purged */
  allTimeTotals: AnalyticsEventTotals
  reviews: AnalyticsReviewCountersApi
  ratings: AnalyticsRatingCountersApi
  /** Not a visitor metric — see AnalyticsDispatchCountersApi for why it is separate */
  dispatches: AnalyticsDispatchCountersApi
}

/** One point on the daily chart — zero-filled for days with no traffic */
export interface AnalyticsChartPointApi {
  date: AnalyticsDateKey
  events: AnalyticsEventTotals
}

/** GET /my/analytics/charts */
export interface AnalyticsChartsApi {
  range: AnalyticsRangeApi
  points: AnalyticsChartPointApi[]
}

/** A single review as the driver/admin dashboard shows it (includes unmoderated ones) */
export interface AnalyticsReviewApi {
  id: number
  authorName: string
  rating: number
  text: string
  cityName?: string
  /** False = still waiting for admin moderation, not visible on the public profile */
  isConfirmed: boolean
  createdAt: string
}

/** GET /my/analytics/reviews */
export interface AnalyticsReviewsApi {
  counters: AnalyticsReviewCountersApi
  items: AnalyticsReviewApi[]
}

/** How many reviews gave each star value, split by moderation state */
export interface AnalyticsRatingBucketApi {
  rating: number
  confirmed: number
  pending: number
}

/** GET /my/analytics/ratings */
export interface AnalyticsRatingsApi {
  counters: AnalyticsRatingCountersApi
  distribution: AnalyticsRatingBucketApi[]
}

/* ── Internal row shapes returned by AnalyticsRepository ── */

export interface AnalyticsDailyStatRow {
  statDate: Date
  eventType: AnalyticsEventType
  eventCount: number
}

export interface AnalyticsEventTypeSumRow {
  eventType: AnalyticsEventType
  total: number
}

/** Same shape as above, one truck's worth per row — the admin drivers export's read */
export interface AnalyticsEventTypeSumRowByTruck extends AnalyticsEventTypeSumRow {
  towTruckId: number
}

/* ── Site-wide (admin panel) ── */

/** The site-wide twin of AnalyticsEventRecord — no tow truck, same guarantees */
export interface SiteEventRecord {
  /** Armenia calendar day, resolved server-side — never taken from the client */
  statDate: AnalyticsDateKey
  eventType: SiteEventType
  /** sha256(rawVisitorId + pepper) — the raw id never reaches the repository */
  visitorKey: string
}

/** Counter per site event type. Always has every key, zero-filled. */
export type SiteEventTotals = Record<SiteEventType, number>

export interface SiteEventTypeSumRow {
  eventType: SiteEventType
  total: number
}

/**
 * Platform-wide callers — how many distinct people pressed "Զանգահարել" on
 * ANY tow truck's profile, not one driver's. The per-truck dashboards already
 * answer "did people call THIS listing"; this answers a different question
 * ("are people calling drivers at all"), which no per-truck number can, since
 * someone who called three different drivers is three per-truck unique
 * visitors and one platform-wide active caller.
 *
 * See `AnalyticsRepository.countUniqueVisitorsSiteWide` /
 * `sumEventTypeSiteWide`, and `ANALYTICS_SITE_WIDE_CALLER_EVENT_TYPE` for why
 * this is specifically the phone button and not WhatsApp/Telegram/email.
 */
export interface SiteWideCallerStatsApi {
  /** Distinct callers, across every truck, inside the selected period */
  uniqueCallers: number
  /**
   * Sum of daily deduplicated call clicks inside the period — same asymmetry
   * as `totals` vs `uniqueVisitors` everywhere else in this module: a visitor
   * who calls two different trucks the same day counts twice here (once per
   * truck's own dedup) but once in `uniqueCallers`.
   */
  totalCalls: number
  /** Same total over all recorded history — never purged */
  allTimeTotalCalls: number
}

/**
 * GET /admin/site-analytics — the numbers the admin panel exists to show.
 *
 * `totals`/`uniqueVisitors` are already deduplicated to once per visitor per
 * Armenia day at write time, so `totals.SITE_VISIT` IS the distinct-people
 * count for the period's days summed, and `uniqueVisitors` is the
 * distinct-people count across the whole window (someone visiting Monday and
 * Friday is 2 daily visits but 1 unique visitor). Both are useful and neither
 * can be derived from the other.
 */
export interface SiteAnalyticsOverviewApi {
  range: AnalyticsRangeApi
  totals: SiteEventTotals
  /** Distinct visitors over the whole window, per event type */
  uniqueVisitors: SiteEventTotals
  /** Same counters over all recorded history — never purged */
  allTimeTotals: SiteEventTotals
  callers: SiteWideCallerStatsApi
}
