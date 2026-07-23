import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AdminAuthService, AdminSession } from './admin-auth.service'
import { AdminLoginDto } from './dto/admin-login.dto'

@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // Brute-force protection — this login is now the ONLY gate on /admin.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: AdminLoginDto): Promise<AdminSession> {
    return this.adminAuthService.login(dto.email, dto.password)
  }
}
