import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { PrivacyConsentModule } from '../privacy-consent/privacy-consent.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { RegistrationController } from './registration.controller'
import { RegistrationRepository } from './registration.repository'
import { RegistrationService } from './registration.service'

@Module({
  imports: [
    AdminAuthModule, // for AdminNotificationService (Telegram new-registration alert)
    TowTrucksModule, // for TowTrucksRepository (duplicate main-phone check at submission time)
    // For PrivacyConsentService (the consent written inside the same
    // transaction as the request) and ConsentRequestContextService (the hashed
    // IP / truncated User-Agent the controller derives). No forwardRef needed:
    // PrivacyConsentModule does not import this one.
    PrivacyConsentModule,
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService, RegistrationRepository],
  exports: [RegistrationRepository],
})
export class RegistrationModule {}
