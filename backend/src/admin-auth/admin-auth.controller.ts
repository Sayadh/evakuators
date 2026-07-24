import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AdminAuthService, AdminLoginResult, AdminSession } from './admin-auth.service'
import { AdminLoginDto } from './dto/admin-login.dto'
import { VerifyAdminCodeDto } from './dto/verify-admin-code.dto'

@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // Brute-force protection — this login is now the ONLY gate on /admin.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: AdminLoginDto): Promise<AdminLoginResult> {
    return this.adminAuthService.login(dto.email, dto.password)
  }

  /** Second step — only reached when login() returned requiresCode: true */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-code')
  @HttpCode(200)
  verifyCode(@Body() dto: VerifyAdminCodeDto): Promise<AdminSession> {
    return this.adminAuthService.verifyCode(dto.email, dto.code)
  }
}
