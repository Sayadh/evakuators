import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { RegistrationModule } from '../registration/registration.module'
import { ReviewsModule } from '../reviews/reviews.module'
import { StorageModule } from '../storage/storage.module'
import { TelegramModule } from '../telegram/telegram.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [
    RegistrationModule,
    ReviewsModule,
    TowTrucksModule,
    TelegramModule,
    AdminAuthModule,
    // For the one-time bulk password migration — see
    // AdminService.issuePasswordsForLinkedDrivers. No cycle: DriverAuthModule
    // depends on neither TelegramModule nor AdminModule.
    DriverAuthModule,
    StorageModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
