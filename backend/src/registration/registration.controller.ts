import { Body, Controller, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { CreateRegistrationDto } from './dto/create-registration.dto'
import { RegistrationCreatedDto, RegistrationService } from './registration.service'

@Controller('registrations')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  submit(@Body() dto: CreateRegistrationDto): Promise<RegistrationCreatedDto> {
    return this.registrationService.submit(dto)
  }
}
