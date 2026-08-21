import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { ReviewsModule } from '../reviews/reviews.module'
import { TelegramModule } from '../telegram/telegram.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { AdminAnalyticsController } from './admin-analytics.controller'
import { AdminDriversExportController } from './admin-drivers-export.controller'
import { AdminSiteAnalyticsController } from './admin-site-analytics.controller'
import { AnalyticsClock } from './analytics-clock.service'
import { AnalyticsDashboardService } from './analytics-dashboard.service'
import { AnalyticsEventFactory } from './analytics-event.factory'
import { AnalyticsTrackingService } from './analytics-tracking.service'
import { AnalyticsVisitorKeyService } from './analytics-visitor-key.service'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsRepository } from './analytics.repository'
import { MyAnalyticsController } from './my-analytics.controller'
import { SiteAnalyticsRepository } from './site-analytics.repository'

/**
 * Provider analytics — see docs/analytics.md.
 *
 * Four controllers, one per audience/shape and therefore one per
 * authorisation model: anonymous writes, driver-scoped reads, admin-scoped
 * per-truck reads, and the admin's all-drivers CSV export. Two services,
 * split by direction (write vs read) rather than by entity, because the
 * write path is hot and anonymous while the read path is cold and
 * authenticated.
 *
 * Dependencies are inbound only: this module imports TowTrucks (existence
 * checks, and — for `AdminDriversExportController` — the driver identity
 * columns the export attaches its own totals to), Reviews (review/rating
 * counters) and Telegram (driver contact notices), and exports nothing.
 * Nothing else in the application depends on analytics, so the whole feature
 * could be removed by deleting this folder and one line in app.module.
 */
@Module({
  imports: [TowTrucksModule, ReviewsModule, DriverAuthModule, AdminAuthModule, TelegramModule],
  controllers: [
    AnalyticsController,
    MyAnalyticsController,
    AdminAnalyticsController,
    AdminSiteAnalyticsController,
    AdminDriversExportController,
  ],
  providers: [
    AnalyticsRepository,
    SiteAnalyticsRepository,
    AnalyticsTrackingService,
    AnalyticsDashboardService,
    AnalyticsEventFactory,
    AnalyticsVisitorKeyService,
    AnalyticsClock,
  ],
})
export class AnalyticsModule {}
