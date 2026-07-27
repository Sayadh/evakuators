import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AdminAuthController } from './admin-auth.controller'
import { AdminAuthService } from './admin-auth.service'
import { AdminJwtGuard } from './admin-jwt.guard'
import { AdminNotificationService } from './admin-notification.service'
import { AdminOtpRepository } from './admin-otp.repository'
import { AdminTelegramWebhookController } from './admin-telegram-webhook.controller'
import { AdminTelegramService } from './admin-telegram.service'
import { AdminUserRepository } from './admin-user.repository'

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuthController, AdminTelegramWebhookController],
  providers: [
    AdminAuthService,
    AdminUserRepository,
    AdminJwtGuard,
    AdminOtpRepository,
    AdminTelegramService,
    AdminNotificationService,
  ],
  // AdminNotificationService is exported so other modules (RegistrationModule)
  // can notify admins without duplicating Telegram/User-lookup logic.
  // AdminOtpRepository is exported so DriverAuthService's single login-code
  // purge cron can clean both OTP tables (see purgeSpentLoginCodes).
  exports: [AdminJwtGuard, JwtModule, AdminNotificationService, AdminOtpRepository],
})
export class AdminAuthModule {}
