import { BadRequestException, Injectable } from '@nestjs/common'
import { AdminNotificationService } from '../admin-auth/admin-notification.service'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
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
    private readonly towTrucksRepository: TowTrucksRepository,
  ) {}

  async submit(dto: CreateRegistrationDto): Promise<RegistrationCreatedDto> {
    // Catch the duplicate-main-phone conflict right when the driver submits,
    // not only later when admin tries to approve (AdminService.approve has
    // the same check — see its comment for why only the main phone matters,
    // secondary is allowed to repeat). Telling them immediately means they
    // can just fix the phone and resubmit, instead of waiting days for a
    // rejection.
    const phoneConflict = await this.towTrucksRepository.findActiveByMainPhone(dto.phone)
    if (phoneConflict) {
      throw new BadRequestException(
        'Այս հեռախոսահամարով արդեն կա ակտիվ էվակուատոր Evakuators.am-ում։ Խնդրում ենք նշել այլ ' +
          'հեռախոսահամար, կամ դիմեք մեզ, եթե կարծում եք, որ սա սխալ է։',
      )
    }

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
