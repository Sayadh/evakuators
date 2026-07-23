import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { DriverAuthService, DriverSession } from './driver-auth.service'
import { RequestCodeDto } from './dto/request-code.dto'
import { VerifyCodeDto } from './dto/verify-code.dto'

@Controller('driver-auth')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  // The service already enforces a 45s per-phone cooldown; this caps abuse
  // across *different* phone numbers from the same IP (Telegram message spam).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-code')
  @HttpCode(200)
  requestCode(@Body() dto: RequestCodeDto): Promise<{ sent: true }> {
    return this.driverAuthService.requestCode(dto.phone).then(() => ({ sent: true }))
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-code')
  @HttpCode(200)
  verifyCode(@Body() dto: VerifyCodeDto): Promise<DriverSession> {
    return this.driverAuthService.verifyCode(dto.phone, dto.code)
  }
}
