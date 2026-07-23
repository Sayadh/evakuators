import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TelegramModule } from '../telegram/telegram.module'
import { TowTrucksModule } from '../tow-trucks/tow-trucks.module'
import { DriverAuthController } from './driver-auth.controller'
import { DriverAuthService } from './driver-auth.service'
import { DriverJwtGuard } from './driver-jwt.guard'
import { DriverOtpRepository } from './driver-otp.repository'

@Module({
  imports: [TowTrucksModule, TelegramModule, JwtModule.register({})],
  controllers: [DriverAuthController],
  providers: [DriverAuthService, DriverOtpRepository, DriverJwtGuard],
  exports: [DriverJwtGuard, JwtModule],
})
export class DriverAuthModule {}
