import { Body, Controller, Post, Req } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { ConsentRequestContextService } from '../privacy-consent/consent-request-context'
import { CreateRegistrationDto } from './dto/create-registration.dto'
import { RegistrationCreatedDto, RegistrationService } from './registration.service'

@Controller('registrations')
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly requestContext: ConsentRequestContextService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  submit(
    @Body() dto: CreateRegistrationDto,
    // The IP and User-Agent for the consent record, derived HERE rather than
    // deeper down, because this is the only layer that legitimately holds a
    // `Request`. Passing the whole request object into the service would make
    // every method below it capable of reading headers, which is how a service
    // ends up quietly depending on transport details it should not know about.
    // What travels inward is two already-hashed, already-truncated strings —
    // see ConsentRequestContextService.
    @Req() request: Request,
  ): Promise<RegistrationCreatedDto> {
    return this.registrationService.submit(dto, this.requestContext.from(request))
  }
}
