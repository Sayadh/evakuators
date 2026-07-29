import type { Review } from '@prisma/client'
import type {
  ReviewApprovalStats,
  ReviewRatingBucket,
} from '../reviews/reviews.repository'
import { ANALYTICS_RATING_VALUES } from './analytics.constants'
import { AnalyticsEventType, SiteEventType } from './analytics.enums'
import type {
  AnalyticsChartPointApi,
  AnalyticsDailyStatRow,
  AnalyticsEventTotals,
  AnalyticsEventTypeSumRow,
  AnalyticsRatingBucketApi,
  AnalyticsRatingCountersApi,
  AnalyticsReviewApi,
  AnalyticsReviewCountersApi,
  SiteEventTotals,
  SiteEventTypeSumRow,
} from './analytics.types'
import { AnalyticsDateKey, dateToDateKey } from './analytics.utils'

/**
 * DB rows → public API shapes. Pure functions, no injection, no Prisma access —
 * same role as tow-truck.mapper.ts / free-route.mapper.ts.
 *
 * The recurring theme here is **zero-filling**. Postgres only stores rows for
 * (day, event type) pairs that actually happened, which is what keeps the table
 * small — but a client should never have to reason about a missing key. Every
 * shape leaving this file has all five event types and every day in the range,
 * explicitly zero. That single decision removes an entire class of
 * `undefined + 1 = NaN` bug from the dashboard and the chart.
 */

/** All five counters at zero — the baseline every total starts from */
export function emptyEventTotals(): AnalyticsEventTotals {
  return {
    [AnalyticsEventType.PAGE_VIEW]: 0,
    [AnalyticsEventType.PHONE_CLICK]: 0,
    [AnalyticsEventType.WHATSAPP_CLICK]: 0,
    [AnalyticsEventType.TELEGRAM_CLICK]: 0,
    [AnalyticsEventType.EMAIL_CLICK]: 0,
  }
}

export function toEventTotals(rows: AnalyticsEventTypeSumRow[]): AnalyticsEventTotals {
  const totals = emptyEventTotals()
  for (const row of rows) {
    totals[row.eventType] = row.total
  }
  return totals
}

/** Site-wide counters at zero — same zero-fill contract as emptyEventTotals() */
export function emptySiteEventTotals(): SiteEventTotals {
  return {
    [SiteEventType.SITE_VISIT]: 0,
    [SiteEventType.FREE_ROUTES_VIEW]: 0,
  }
}

export function toSiteEventTotals(rows: SiteEventTypeSumRow[]): SiteEventTotals {
  const totals = emptySiteEventTotals()
  for (const row of rows) {
    totals[row.eventType] = row.total
  }
  return totals
}

/**
 * Pivots the flat (day, event type, count) rows into one point per day.
 *
 * `dateKeys` is generated from the requested range rather than from the rows,
 * so days with no traffic at all appear as zeros instead of being skipped —
 * without that, a 30-day chart with traffic on 4 days would render as a
 * 4-point line and read as continuous activity.
 */
export function toChartPoints(
  rows: AnalyticsDailyStatRow[],
  dateKeys: AnalyticsDateKey[],
): AnalyticsChartPointApi[] {
  const byDate = new Map<AnalyticsDateKey, AnalyticsEventTotals>(
    dateKeys.map((date) => [date, emptyEventTotals()]),
  )

  for (const row of rows) {
    const totals = byDate.get(dateToDateKey(row.statDate))
    // Defensive: a row outside the requested range can only mean the range and
    // the query drifted apart, so drop it rather than inventing a point.
    if (totals) totals[row.eventType] = row.eventCount
  }

  return dateKeys.map((date) => ({
    date,
    events: byDate.get(date) ?? emptyEventTotals(),
  }))
}

export function toReviewCounters(stats: ReviewApprovalStats[]): AnalyticsReviewCountersApi {
  const confirmed = stats.find((stat) => stat.isApproved)?.count ?? 0
  const pending = stats.find((stat) => !stat.isApproved)?.count ?? 0
  return { confirmed, pending, total: confirmed + pending }
}

export function toRatingCounters(stats: ReviewApprovalStats[]): AnalyticsRatingCountersApi {
  const confirmed = stats.find((stat) => stat.isApproved)
  const pending = stats.find((stat) => !stat.isApproved)
  return {
    confirmed: confirmed?.count ?? 0,
    pending: pending?.count ?? 0,
    confirmedAverage: roundRating(confirmed?.averageRating),
    pendingAverage: roundRating(pending?.averageRating),
  }
}

/**
 * One bucket per possible star value, always 1→5, zeros included — the
 * histogram must not change shape depending on which ratings happen to exist.
 */
export function toRatingDistribution(buckets: ReviewRatingBucket[]): AnalyticsRatingBucketApi[] {
  return ANALYTICS_RATING_VALUES.map((rating) => ({
    rating,
    confirmed: findBucket(buckets, rating, true),
    pending: findBucket(buckets, rating, false),
  }))
}

export function toAnalyticsReviewApi(review: Review): AnalyticsReviewApi {
  return {
    id: review.id,
    authorName: review.authorName,
    rating: review.rating,
    text: review.text,
    cityName: review.cityName ?? undefined,
    isConfirmed: review.isApproved,
    createdAt: review.createdAt.toISOString(),
  }
}

function findBucket(buckets: ReviewRatingBucket[], rating: number, isApproved: boolean): number {
  return (
    buckets.find((bucket) => bucket.rating === rating && bucket.isApproved === isApproved)?.count ?? 0
  )
}

/**
 * `null` (not `0`) when there are no reviews to average — a driver with no
 * reviews has *no* rating, and rendering that as 0.0 would look like a terrible
 * score rather than an empty state.
 */
function roundRating(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return Math.round(value * 10) / 10
}
