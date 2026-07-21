import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration from './config/configuration'
import { validateEnv } from './config/env.validation'
import { AdminModule } from './admin/admin.module'
import { HealthModule } from './health/health.module'
import { ImagesModule } from './images/images.module'
import { PrismaModule } from './prisma/prisma.module'
import { RegistrationModule } from './registration/registration.module'
import { ReviewsModule } from './reviews/reviews.module'
import { StorageModule } from './storage/storage.module'
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
  ],
})
export class AppModule {}
