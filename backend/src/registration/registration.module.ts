import { Module } from '@nestjs/common'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { RegistrationController } from './registration.controller'
import { RegistrationRepository } from './registration.repository'
import { RegistrationService } from './registration.service'

@Module({
  imports: [AdminAuthModule], // for AdminNotificationService (Telegram new-registration alert)
  controllers: [RegistrationController],
  providers: [RegistrationService, RegistrationRepository],
  exports: [RegistrationRepository],
})
export class RegistrationModule {}
