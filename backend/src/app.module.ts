import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration from './config/configuration'
import { validateEnv } from './config/env.validation'
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
    PrismaModule,
    HealthModule,
    StorageModule,
    ImagesModule,
    TowTrucksModule,
    ReviewsModule,
    RegistrationModule,
    AdminModule,
    TelegramModule,
    DriverAuthModule,
    MyTowTruckModule,
  ],
})
export class AppModule {}
