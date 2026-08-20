import { Module, forwardRef } from '@nestjs/common'
import { DriverAuthModule } from '../driver-auth/driver-auth.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ConsentRequestContextService } from './consent-request-context'
import { PrivacyConsentController } from './privacy-consent.controller'
import { PrivacyConsentRepository } from './privacy-consent.repository'
import { PrivacyConsentService } from './privacy-consent.service'

/**
 * Consent to the processing and publication of a driver's personal data.
 *
 * Exports its service and repository because three other modules write consent
 * or read its status and none of them may re-implement either:
 *
 * - `RegistrationModule` records the consent that comes with a new request, in
 *   the same transaction as the request.
 * - `AdminModule` re-points that consent at the truck an approval creates.
 * - `DriverAuthModule`'s login answers `requiresPrivacyConsent`.
 *
 * `forwardRef` on `DriverAuthModule`, because this is a genuine cycle rather
 * than an accident: this module needs `DriverJwtGuard` to protect its routes,
 * and `DriverAuthService.login()` needs this module's service to answer
 * `requiresPrivacyConsent`. Declared rather than broken by duplicating the
 * "is there a live consent at the current version" query into driver auth —
 * two copies of that predicate would eventually disagree about what a withdrawn
 * consent means, and the disagreement would be invisible until a driver got
 * locked out or slipped through. Exactly the same shape, and the same argument,
 * as `MyTowTruckModule` ↔ `ProfileChangesModule`.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => DriverAuthModule)],
  controllers: [PrivacyConsentController],
  providers: [PrivacyConsentService, PrivacyConsentRepository, ConsentRequestContextService],
  exports: [PrivacyConsentService, PrivacyConsentRepository],
})
export class PrivacyConsentModule {}
