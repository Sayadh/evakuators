import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AdminAuthModule } from '../admin-auth/admin-auth.module'
import { TelegramModule } from '../telegram/telegram.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { DriverAuthController } from './driver-auth.controller'
import { DriverAuthService } from './driver-auth.service'
import { DriverJwtGuard } from './driver-jwt.guard'
import { DriverOtpRepository } from './driver-otp.repository'

@Module({
  // AdminAuthModule is imported only for AdminOtpRepository — the login-code
  // purge cron in DriverAuthService cleans both OTP tables in one job.
  imports: [TowTrucksModule, TelegramModule, AdminAuthModule, JwtModule.register({})],
  controllers: [DriverAuthController],
  providers: [DriverAuthService, DriverOtpRepository, DriverJwtGuard],
  exports: [DriverJwtGuard, JwtModule],
})
export class DriverAuthModule {}
