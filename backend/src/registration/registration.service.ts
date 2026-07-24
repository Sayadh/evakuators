import { BadRequestException, Injectable } from '@nestjs/common'
import { AdminNotificationService } from '../admin-auth/admin-notification.service'
import type { CreateRegistrationDto } from './dto/create-registration.dto'
import { RegistrationRepository } from './registration.repository'

export interface RegistrationCreatedDto {
  id: number
  status: string
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly repository: RegistrationRepository,
    private readonly adminNotification: AdminNotificationService,
  ) {}

  async submit(dto: CreateRegistrationDto): Promise<RegistrationCreatedDto> {
    const available = await this.repository.countUnattachedImages(dto.imageIds)
    if (available !== dto.imageIds.length) {
      throw new BadRequestException(
        'Նկարներից մեկը կամ մի քանիսը վավեր չեն կամ արդեն օգտագործված են։ Խնդրում ենք նորից վերբեռնել նկարները և կրկին ուղարկել հայտը։',
      )
    }

    const { imageIds, ...data } = dto
    const request = await this.repository.create(data, imageIds)

    // Best-effort — AdminNotificationService swallows its own errors, a
    // Telegram hiccup must never fail a driver's registration submission.
    await this.adminNotification.notifyNewRegistration({
      firstName: request.firstName,
      lastName: request.lastName,
      phone: request.phone,
      vehicleBrand: request.vehicleBrand,
      vehicleModel: request.vehicleModel,
    })

    return { id: request.id, status: request.status }
  }
}
