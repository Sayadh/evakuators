import type { AnalyticsEventType, AnalyticsPeriod } from './analytics.enums'
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
