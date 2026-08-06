import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { DriverAuthService, DriverSession } from './driver-auth.service'
import { DriverLoginDto } from './dto/driver-login.dto'

@Controller('driver-auth')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  /**
   * Stricter than the global 60/min, and stricter than the OTP endpoints this
   * replaced. Those were rate-limited to protect the Telegram bot from being
   * used as a spam relay; this one guards a password, where the request itself
   * IS the guess. 10 per minute per IP leaves an honest driver with mistyping
   * room and makes an online dictionary attack useless.
   *
   * Note this is the only limit in front of the password: there is no
   * per-account lockout, deliberately. A lockout keyed on a phone number that
   * the site publishes on every card would let anyone lock any driver out of
   * their own account.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: DriverLoginDto): Promise<DriverSession> {
    return this.driverAuthService.login(dto.phone, dto.password)
  }
}
