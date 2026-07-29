import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard'
import { AnalyticsDashboardService } from './analytics-dashboard.service'
import type { SiteAnalyticsOverviewApi } from './analytics.types'
import { AnalyticsPeriodQuery } from './dto/analytics-period.query'

/**
 * Site-wide traffic — the only report in this module with no tow truck in it.
 *
 * Admin-only, and not because the numbers are sensitive on their own but
 * because they are *ours*: how the platform as a whole is doing is a business
 * metric, not something a driver's dashboard should surface next to their own
 * listing's performance.
 *
 * Its own controller rather than another route on AdminAnalyticsController,
 * whose path is `/admin/tow-trucks/:towTruckId/analytics` — hanging a
 * truck-less report off a truck-scoped prefix would either need a fake id or a
 * route that contradicts its own parent segment.
 */
@Controller('admin/site-analytics')
@UseGuards(AdminJwtGuard)
export class AdminSiteAnalyticsController {
  constructor(private readonly dashboardService: AnalyticsDashboardService) {}

  @Get()
  getOverview(@Query() query: AnalyticsPeriodQuery): Promise<SiteAnalyticsOverviewApi> {
    return this.dashboardService.getSiteOverview(query.period)
  }
}
