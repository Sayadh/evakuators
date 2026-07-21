import { BadRequestException, Injectable } from '@nestjs/common'
import type { CreateRegistrationDto } from './dto/create-registration.dto'
import { RegistrationRepository } from './registration.repository'

export interface RegistrationCreatedDto {
  id: number
  status: string
}

@Injectable()
export class RegistrationService {
  constructor(private readonly repository: RegistrationRepository) {}

  async submit(dto: CreateRegistrationDto): Promise<RegistrationCreatedDto> {
    const available = await this.repository.countUnattachedImages(dto.imageIds)
    if (available !== dto.imageIds.length) {
      throw new BadRequestException('Some image ids are invalid or already used')
    }

    const { imageIds, ...data } = dto
    const request = await this.repository.create(data, imageIds)

    return { id: request.id, status: request.status }
  }
}
