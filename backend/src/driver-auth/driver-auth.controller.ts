import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { DriverAuthService, DriverSession } from './driver-auth.service'
import { RequestCodeDto } from './dto/request-code.dto'
import { VerifyCodeDto } from './dto/verify-code.dto'

@Controller('driver-auth')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  @Post('request-code')
  @HttpCode(200)
  requestCode(@Body() dto: RequestCodeDto): Promise<{ sent: true }> {
    return this.driverAuthService.requestCode(dto.phone).then(() => ({ sent: true }))
  }

  @Post('verify-code')
  @HttpCode(200)
  verifyCode(@Body() dto: VerifyCodeDto): Promise<DriverSession> {
    return this.driverAuthService.verifyCode(dto.phone, dto.code)
  }
}
