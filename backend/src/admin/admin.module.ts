import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { PrivacyConsentModule } from '../privacy-consent/privacy-consent.module'
import { ProfileChangesModule } from '../profile-changes/profile-changes.module'
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
    // The driver-edit moderation queue. No cycle: ProfileChangesModule knows
    // nothing about admin auth, it just exposes approve/reject.
    ProfileChangesModule,
    // Only so approve() can move a registration's consent onto the truck it
    // creates. Nothing here ever writes a consent — an admin cannot consent on
    // a driver's behalf, which is why the module exposes no admin route at all.
    PrivacyConsentModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
