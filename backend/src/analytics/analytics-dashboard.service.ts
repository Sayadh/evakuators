import { Injectable, NotFoundException } from '@nestjs/common'
import { ReviewsRepository } from '../reviews/reviews.repository'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { AnalyticsClock } from './analytics-clock.service'
import { ANALYTICS_UNIQUE_VISITOR_EVENT_TYPE } from './analytics.constants'
import { AnalyticsPeriod, AnalyticsReviewStatus } from './analytics.enums'
import {
  toAnalyticsReviewApi,
  toChartPoints,
  toEventTotals,
  toRatingCounters,
  toRatingDistribution,
  toReviewCounters,
} from './analytics.mapper'
import { AnalyticsRepository } from './analytics.repository'
import type {
  AnalyticsChartsApi,
  AnalyticsOverviewApi,
  AnalyticsRatingsApi,
  AnalyticsReviewsApi,
} from './analytics.types'
import { buildDateKeyRange } from './analytics.utils'

/**
 * The READ half of the module.
 *
 * Every method takes an already-authorised `towTruckId`. That is the core
 * security property of this design: the service has no notion of "the current
 * user", cannot be asked for "all trucks", and physically cannot return data
 * for a truck other than the id it was handed. Deciding *which* id a caller is
 * allowed to pass is the controllers' job — the driver controller reads it from
 * the JWT and never from user input, the admin controller reads it from the URL
 * behind AdminJwtGuard. One service, two authorisation models, zero duplicated
 * aggregation logic.
 */
@Injectable()
export class AnalyticsDashboardService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly reviewsRepository: ReviewsRepository,
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly clock: AnalyticsClock,
  ) {}

  /**
   * Overview cards + customer activity.
   *
   * Four independent queries, issued concurrently because none depends on
   * another's result — the endpoint costs one round-trip's latency, not four:
   *
   * - period totals: one grouped read of the aggregate table
   * - all-time totals: same read without a date filter (the "Total Page Views"
   *   style cards are lifetime figures; the period only scopes the trend)
   * - unique visitors: COUNT(DISTINCT visitorKey) over the dedup ledger
   * - review/rating counters: one grouped read of Review
   *
   * Note the asymmetry between `totals.PAGE_VIEW` and `uniqueVisitors`: the
   * former is the sum of *daily* unique viewers (someone returning on three
   * days counts three times), the latter is distinct visitors across the whole
   * window (that person counts once). Both are correct and they answer
   * different questions, which is exactly why the dashboard shows both.
   */
  async getOverview(towTruckId: number, period: AnalyticsPeriod): Promise<AnalyticsOverviewApi> {
    const range = this.clock.resolveRange(period)

    const [periodRows, allTimeRows, uniqueVisitors, reviewStats] = await Promise.all([
      this.analyticsRepository.sumByEventType(towTruckId, range),
      this.analyticsRepository.sumByEventType(towTruckId),
      this.analyticsRepository.countUniqueVisitors(
        towTruckId,
        ANALYTICS_UNIQUE_VISITOR_EVENT_TYPE,
        range,
      ),
      this.reviewsRepository.groupStatsByApproval(towTruckId),
    ])

    return {
      range,
      totals: toEventTotals(periodRows),
      uniqueVisitors,
      allTimeTotals: toEventTotals(allTimeRows),
      reviews: toReviewCounters(reviewStats),
      ratings: toRatingCounters(reviewStats),
    }
  }

  /**
   * Daily series for the 7/30/90-day charts.
   *
   * The date axis is generated from the range, not from the returned rows, and
   * the mapper zero-fills it — so the frontend chart never has to guess at
   * gaps, and a quiet week renders as a flat line rather than a straight jump
   * between two distant points.
   */
  async getCharts(towTruckId: number, period: AnalyticsPeriod): Promise<AnalyticsChartsApi> {
    const range = this.clock.resolveRange(period)
    const rows = await this.analyticsRepository.findDailyStats(towTruckId, range)

    return {
      range,
      points: toChartPoints(rows, buildDateKeyRange(range.from, range.to)),
    }
  }

  /**
   * The driver's own reviews, including ones still awaiting moderation.
   *
   * Deliberately not period-scoped: a review from four months ago is still the
   * driver's current reputation, unlike a page view.
   */
  async getReviews(
    towTruckId: number,
    status: AnalyticsReviewStatus,
    limit: number,
  ): Promise<AnalyticsReviewsApi> {
    const [items, stats] = await Promise.all([
      this.reviewsRepository.findAllByTowTruckId(towTruckId, {
        isApproved: this.toApprovalFilter(status),
        limit,
      }),
      this.reviewsRepository.groupStatsByApproval(towTruckId),
    ])

    return {
      counters: toReviewCounters(stats),
      items: items.map(toAnalyticsReviewApi),
    }
  }

  /** Star distribution 1→5, split confirmed vs pending, plus the same averages */
  async getRatings(towTruckId: number): Promise<AnalyticsRatingsApi> {
    const [stats, buckets] = await Promise.all([
      this.reviewsRepository.groupStatsByApproval(towTruckId),
      this.reviewsRepository.groupByRating(towTruckId),
    ])

    return {
      counters: toRatingCounters(stats),
      distribution: toRatingDistribution(buckets),
    }
  }

  /**
   * Driver entry point: re-checks `isActive` on every call, matching
   * MyTowTruckService/FreeRoutesService. A driver deactivated mid-session holds
   * a technically-valid 30-day JWT, and it must stop working immediately rather
   * than at expiry.
   */
  async assertDriverCanRead(towTruckId: number): Promise<void> {
    const towTruck = await this.towTrucksRepository.findStatusById(towTruckId)
    if (!towTruck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')
    if (!towTruck.isActive) {
      throw new NotFoundException('Ձեր պրոֆիլն ապաակտիվացված է, դիմեք admin-ին')
    }
  }

  /**
   * Admin entry point: existence only. An admin explicitly *should* be able to
   * inspect a deactivated truck's numbers — that history is usually why they
   * deactivated it.
   */
  async assertTowTruckExists(towTruckId: number): Promise<void> {
    const towTruck = await this.towTrucksRepository.findStatusById(towTruckId)
    if (!towTruck) throw new NotFoundException('Էվակուատորը չի գտնվել')
  }

  /** `undefined` means "no filter" — Prisma then omits the isApproved clause */
  private toApprovalFilter(status: AnalyticsReviewStatus): boolean | undefined {
    if (status === AnalyticsReviewStatus.Confirmed) return true
    if (status === AnalyticsReviewStatus.Pending) return false
    return undefined
  }
}
