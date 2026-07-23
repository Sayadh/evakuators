import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import configuration from './config/configuration'
import { validateEnv } from './config/env.validation'
import { AdminAuthModule } from './admin-auth/admin-auth.module'
import { AdminModule } from './admin/admin.module'
import { DriverAuthModule } from './driver-auth/driver-auth.module'
import { HealthModule } from './health/health.module'
import { ImagesModule } from './images/images.module'
import { MyTowTruckModule } from './my-tow-truck/my-tow-truck.module'
import { PrismaModule } from './prisma/prisma.module'
import { RegistrationModule } from './registration/registration.module'
import { ReviewsModule } from './reviews/reviews.module'
import { StorageModule } from './storage/storage.module'
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
    // stricter @Throttle() override — see their controllers.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
