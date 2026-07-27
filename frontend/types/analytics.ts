import type { AnalyticsEventType, AnalyticsPeriod } from './enums'

/**
 * Mirrors the backend analytics API shapes (backend/src/analytics/
 * analytics.types.ts). Kept as a hand-written mirror rather than generated
 * types, matching how every other API shape in this project is declared
 * (`AdminTowTruck`, `MyFreeRoute`, …) — there is no shared package between the
 * two apps, by design.
 */

/** Always has all five keys, zero-filled by the backend mapper */
export type AnalyticsEventTotals = Record<AnalyticsEventType, number>

export interface AnalyticsRange {
  period: AnalyticsPeriod
  /** `YYYY-MM-DD`, inclusive, Armenia calendar */
  from: string
  to: string
  days: number
}

export interface AnalyticsReviewCounters {
  confirmed: number
  pending: number
  total: number
}

export interface AnalyticsRatingCounters {
  confirmed: number
  pending: number
  /** Null when there are no reviews to average — render as "—", never as 0 */
  confirmedAverage: number | null
  pendingAverage: number | null
}

export interface AnalyticsOverview {
  range: AnalyticsRange
  /** Counters inside the selected period */
  totals: AnalyticsEventTotals
  /** Distinct visitors in the period — NOT the sum of daily page views */
  uniqueVisitors: number
  /** Lifetime counters, unaffected by the period switcher */
  allTimeTotals: AnalyticsEventTotals
  reviews: AnalyticsReviewCounters
  ratings: AnalyticsRatingCounters
}

export interface AnalyticsChartPoint {
  /** `YYYY-MM-DD` */
  date: string
  events: AnalyticsEventTotals
}

export interface AnalyticsCharts {
  range: AnalyticsRange
  /** One point per day in the range, zero-filled — safe to render directly */
  points: AnalyticsChartPoint[]
}

export interface AnalyticsReview {
  id: number
  authorName: string
  rating: number
  text: string
  cityName?: string
  /** False = awaiting admin moderation, not yet visible on the public profile */
  isConfirmed: boolean
  createdAt: string
}

export interface AnalyticsReviews {
  counters: AnalyticsReviewCounters
  items: AnalyticsReview[]
}

export interface AnalyticsRatingBucket {
  rating: number
  confirmed: number
  pending: number
}

export interface AnalyticsRatings {
  counters: AnalyticsRatingCounters
  /** Always 5 buckets, 1→5, zeros included */
  distribution: AnalyticsRatingBucket[]
}

/** What the frontend sends to POST /analytics/events */
export interface TrackAnalyticsEventPayload {
  towTruckId: number
  eventType: AnalyticsEventType
  /** Anonymous, browser-generated UUID v4 — see utils/visitorId.ts */
  visitorId: string
}
