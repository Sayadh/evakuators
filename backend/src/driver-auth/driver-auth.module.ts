import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { DriverAuthController } from './driver-auth.controller'
import { DriverAuthService } from './driver-auth.service'
import { DriverJwtGuard } from './driver-jwt.guard'

/**
 * No TelegramModule import, and it must stay that way: TelegramModule imports
 * THIS module (the webhook hands a newly linked driver their password), so
 * importing it back would be a cycle. The direction is deliberate — driver auth
 * mints passwords and knows nothing about how they are delivered.
 *
 * AdminAuthModule is gone too. It was here only so the login-code purge cron
 * could clean both OTP tables in one job; with driver codes removed, that cron
 * lives in AdminAuthService next to the only table it still has to sweep.
 */
@Module({
  imports: [TowTrucksModule, JwtModule.register({})],
  controllers: [DriverAuthController],
  providers: [DriverAuthService, DriverJwtGuard],
  exports: [DriverAuthService, DriverJwtGuard, JwtModule],
})
export class DriverAuthModule {}
