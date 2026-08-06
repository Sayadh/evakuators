import { BadRequestException, Injectable } from '@nestjs/common'
import { AdminNotificationService } from '../admin-auth/admin-notification.service'
import { assertWithinArmenia } from '../common/coordinates'
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
    // Coordinates are optional (see CreateRegistrationDto), but they are a
    // PAIR: one axis on its own describes no place at all, and a row holding
    // half of one would be neither "has a location" nor "has none" for every
    // reader downstream. Rejected outright rather than silently dropping the
    // stray half, which would hide a broken client instead of reporting it.
    //
    // This lives here and not on the DTO because class-validator decorates one
    // property at a time and cannot express a rule about two.
    const hasLatitude = dto.latitude !== undefined
    const hasLongitude = dto.longitude !== undefined
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'Կոորդինատները պետք է լրացվեն ամբողջությամբ՝ և՛ լայնությունը, և՛ երկայնությունը, կամ թողնվեն դատարկ։',
      )
    }

    // The DTO already proved these are real numbers inside ±90/±180; this is
    // the geography half of the rule, kept out of the DTO so the two can never
    // produce a single joined "must be between -90 and 90, this point is not in
    // Armenia" message. See common/coordinates.ts.
    //
    // Checked before the phone lookup below rather than after: a bad
    // coordinate is a bad request, and there is no reason to spend a query on
    // a submission that cannot be stored.
    if (hasLatitude && hasLongitude) {
      assertWithinArmenia(dto.latitude as number, dto.longitude as number)
    }

    // Catch the duplicate-main-phone conflict right when the driver submits,
    // not only later when admin tries to approve (AdminService.approve has
    // the same check — see its comment for why only the main phone matters,
    // secondary is allowed to repeat, and why this checks EVERY truck
    // regardless of active/deactivated status). Telling them immediately
    // means they can just fix the phone and resubmit, instead of waiting
    // days for a rejection.
    const phoneConflict = await this.towTrucksRepository.findByMainPhoneAnyStatus(dto.phone)
    if (phoneConflict) {
      throw new BadRequestException(
        'Այս հեռախոսահամարով արդեն կա էվակուատոր Evakuators.am-ում։ Խնդրում ենք նշել այլ ' +
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
