import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
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
 * Driver self-service analytics — mounted under `/my/*` like every other
 * own-data route (`/my/tow-truck`, `/my/free-routes`).
 *
 * ## The one thing that must never change here
 *
 * `towTruckId` comes from `request.towTruckId`, which DriverJwtGuard sets from
 * the JWT's `sub` claim. There is no `:id` parameter, no `towTruckId` query
 * param, and no body on any of these routes — a driver cannot even express the
 * request "show me someone else's analytics". That is a stronger guarantee than
 * checking ownership after the fact, because there is no id to check: the only
 * id in scope is the one the server signed.
 *
 * This controller is intentionally a thin twin of AdminAnalyticsController.
 * They share every line of business logic through AnalyticsDashboardService and
 * differ only in how the tow truck id is authorised — merging them behind a
 * base class would mean one route table serving two authorisation models, which
 * is exactly the kind of cleverness that later ships an authorisation bug.
 */
@Controller('my/analytics')
@UseGuards(DriverJwtGuard)
export class MyAnalyticsController {
  constructor(private readonly dashboardService: AnalyticsDashboardService) {}

  @Get()
  async getOverview(
    @Req() request: AuthenticatedDriverRequest,
    @Query() query: AnalyticsPeriodQuery,
  ): Promise<AnalyticsOverviewApi> {
    await this.dashboardService.assertDriverCanRead(request.towTruckId)
    return this.dashboardService.getOverview(request.towTruckId, query.period)
  }

  @Get('charts')
  async getCharts(
    @Req() request: AuthenticatedDriverRequest,
    @Query() query: AnalyticsPeriodQuery,
  ): Promise<AnalyticsChartsApi> {
    await this.dashboardService.assertDriverCanRead(request.towTruckId)
    return this.dashboardService.getCharts(request.towTruckId, query.period)
  }

  @Get('reviews')
  async getReviews(
    @Req() request: AuthenticatedDriverRequest,
    @Query() query: AnalyticsReviewsQuery,
  ): Promise<AnalyticsReviewsApi> {
    await this.dashboardService.assertDriverCanRead(request.towTruckId)
    return this.dashboardService.getReviews(request.towTruckId, query.status, query.limit)
  }

  @Get('ratings')
  async getRatings(@Req() request: AuthenticatedDriverRequest): Promise<AnalyticsRatingsApi> {
    await this.dashboardService.assertDriverCanRead(request.towTruckId)
    return this.dashboardService.getRatings(request.towTruckId)
  }
}
