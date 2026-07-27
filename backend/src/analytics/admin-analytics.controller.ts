import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { AnalyticsDashboardService } from './analytics-dashboard.service'
import type {
  AnalyticsChartsApi,
  AnalyticsOverviewApi,
  AnalyticsRatingsApi,
  AnalyticsReviewsApi,
} from './analytics.types'
import { AnalyticsPeriodQuery } from './dto/analytics-period.query'
import { AnalyticsReviewsQuery } from './dto/analytics-reviews.query'

/**
 * Same four reports, admin-scoped: any tow truck, by id, active or not.
 *
 * Path deliberately nests under the existing `/admin/tow-trucks/:id/*` family
 * (`/active`, `/featured`, `/telegram-link`) so the admin API keeps one shape.
 * It lives in the analytics module rather than in AdminController because it is
 * analytics logic that happens to be admin-authorised — AdminModule would then
 * have to depend on the analytics module, and the moderation controller would
 * grow endpoints that have nothing to do with moderation.
 *
 * Unlike the driver twin, the id comes from the URL — which is safe precisely
 * because AdminJwtGuard has already established that the caller is allowed to
 * read every truck. There is no per-truck ownership concept for admins.
 */
@Controller('admin/tow-trucks/:towTruckId/analytics')
@UseGuards(AdminJwtGuard)
export class AdminAnalyticsController {
  constructor(private readonly dashboardService: AnalyticsDashboardService) {}

  @Get()
  async getOverview(
    @Param('towTruckId', ParseIntPipe) towTruckId: number,
    @Query() query: AnalyticsPeriodQuery,
  ): Promise<AnalyticsOverviewApi> {
    await this.dashboardService.assertTowTruckExists(towTruckId)
    return this.dashboardService.getOverview(towTruckId, query.period)
  }

  @Get('charts')
  async getCharts(
    @Param('towTruckId', ParseIntPipe) towTruckId: number,
    @Query() query: AnalyticsPeriodQuery,
  ): Promise<AnalyticsChartsApi> {
    await this.dashboardService.assertTowTruckExists(towTruckId)
    return this.dashboardService.getCharts(towTruckId, query.period)
  }

  @Get('reviews')
  async getReviews(
    @Param('towTruckId', ParseIntPipe) towTruckId: number,
    @Query() query: AnalyticsReviewsQuery,
  ): Promise<AnalyticsReviewsApi> {
    await this.dashboardService.assertTowTruckExists(towTruckId)
    return this.dashboardService.getReviews(towTruckId, query.status, query.limit)
  }

  @Get('ratings')
  async getRatings(
    @Param('towTruckId', ParseIntPipe) towTruckId: number,
  ): Promise<AnalyticsRatingsApi> {
    await this.dashboardService.assertTowTruckExists(towTruckId)
    return this.dashboardService.getRatings(towTruckId)
  }
}
