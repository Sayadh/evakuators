import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { SsrAwareThrottlerGuard } from './common/ssr-aware-throttler.guard'
import configuration from './config/configuration'
import { validateEnv } from './config/env.validation'
import { AdminAuthModule } from './admin-auth/admin-auth.module'
import { AdminModule } from './admin/admin.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { DriverAuthModule } from './driver-auth/driver-auth.module'
import { FreeRoutesModule } from './free-routes/free-routes.module'
import { HealthModule } from './health/health.module'
import { IdramModule } from './idram/idram.module'
import { ImagesModule } from './images/images.module'
import { MyTowTruckModule } from './my-tow-truck/my-tow-truck.module'
import { NearestModule } from './nearest/nearest.module'
import { PrivacyConsentModule } from './privacy-consent/privacy-consent.module'
import { ProfileChangesModule } from './profile-changes/profile-changes.module'
import { PrismaModule } from './prisma/prisma.module'
import { RegistrationModule } from './registration/registration.module'
import { ReviewsModule } from './reviews/reviews.module'
import { StorageModule } from './storage/storage.module'
import { SubscriptionsModule } from './subscriptions/subscriptions.module'
import { TelegramModule } from './telegram/telegram.module'
import { TowTrucksModule } from './tow-trucks/tow-trucks.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // Global default: 60 requests / 60s per IP. Abuse-prone endpoints
    // (image upload, registration/review submission, driver-auth) apply a
    // stricter @Throttle() override — see their controllers. Requests coming
    // from this machine (the Nuxt SSR process) are exempt — see
    // SsrAwareThrottlerGuard for why they'd otherwise all share one bucket.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    // Powers @Cron() in FreeRoutesService (auto-expiry cleanup) and in
    // AnalyticsTrackingService (visitor-day retention purge)
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    StorageModule,
    ImagesModule,
    TowTrucksModule,
    ReviewsModule,
    RegistrationModule,
    AdminModule,
    AdminAuthModule,
    TelegramModule,
    DriverAuthModule,
    MyTowTruckModule,
    FreeRoutesModule,
    AnalyticsModule,
    NearestModule,
    ProfileChangesModule,
    PrivacyConsentModule,
    SubscriptionsModule,
    IdramModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SsrAwareThrottlerGuard }],
})
export class AppModule {}
