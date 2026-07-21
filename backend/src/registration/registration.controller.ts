import { Body, Controller, Post } from '@nestjs/common'
import { CreateRegistrationDto } from './dto/create-registration.dto'
import { RegistrationCreatedDto, RegistrationService } from './registration.service'

@Controller('registrations')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post()
  submit(@Body() dto: CreateRegistrationDto): Promise<RegistrationCreatedDto> {
    return this.registrationService.submit(dto)
  }
}
