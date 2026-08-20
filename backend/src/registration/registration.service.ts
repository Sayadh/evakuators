import { BadRequestException, Injectable } from '@nestjs/common'
import { AdminNotificationService } from '../admin-auth/admin-notification.service'
import { assertWithinArmenia } from '../common/coordinates'
import type { ConsentRequestContext } from '../privacy-consent/consent-request-context'
import { PrivacyConsentService, assertCurrentPolicyVersion } from '../privacy-consent/privacy-consent.service'
import { assertRegistrationAreasWithinLimit } from '../tow-trucks/service-area-limits'
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
    private readonly privacyConsent: PrivacyConsentService,
  ) {}

  async submit(
    dto: CreateRegistrationDto,
    consentContext: ConsentRequestContext,
  ): Promise<RegistrationCreatedDto> {
    // The version gate, before anything else is checked or written.
    //
    // `privacyConsentAccepted` is already guaranteed true by the DTO's
    // `@Equals(true)` — an unticked box never reaches this method. What the DTO
    // cannot check is WHICH policy was ticked, because that needs the server's
    // current constant: a tab left open across a policy change would otherwise
    // register a driver against a document it never displayed.
    //
    // First, so a stale tab is told to reload before it burns its 5/minute
    // registration budget on work that cannot be stored.
    assertCurrentPolicyVersion(dto.privacyPolicyVersion)

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

    // How many places a driver may claim. Also a cross-field rule, so also here
    // rather than on the DTO. This payload carries flat slugs with no types, so
    // what is applied is a provable upper bound rather than the exact rule —
    // see service-area-limits.ts for why that is sound, and where the exact
    // rule runs before anything reaches the public site.
    //
    // The truck goes with it now, because the cap is not a rule about every
    // driver: a crane truck or a machinery transporter is dispatched against a
    // booked job and genuinely does cross the country for it, so the 2/3/5
    // budget — written for a roadside evacuator that cannot keep a nationwide
    // promise — is lifted for them. The "at least one place" and "at most 2
    // marzes" rules moved in there with it, for the same reason: both stopped
    // being true of every driver, and a DTO decorator cannot see `vehicleType`.
    assertRegistrationAreasWithinLimit(dto.regionSlugs, dto.citySlugs, {
      vehicleType: dto.vehicleType,
      manipulator: dto.manipulator,
      heavyEquipment: dto.heavyEquipment,
      servesAllArmenia: dto.servesAllArmenia,
    })

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

    // The consent fields are destructured OUT, not spread into the row: they
    // describe an act of consenting, which lives in `DriverPrivacyConsent` as
    // its own auditable record, and `RegistrationRequest` has no columns for
    // them. Leaving them in `data` would make Prisma reject the create — which
    // is the failure mode you want here, but naming them makes the omission
    // obviously deliberate rather than a spread that happened to work.
    //
    // `privacyConsentAccepted` is discarded rather than stored: the DTO has
    // already proved it is `true` (it cannot be anything else and reach this
    // line), and a column holding "true, always" records nothing. What is worth
    // recording — that this person consented, to which version, when, from
    // where — is the consent row itself.
    const { imageIds, privacyPolicyVersion, ...rest } = dto
    const { privacyConsentAccepted, ...data } = rest
    void privacyConsentAccepted

    const request = await this.repository.create(data, imageIds, (registrationRequestId, tx) =>
      // Inside the transaction that creates the request — see
      // RegistrationRepository.create. A request stored without its consent is
      // a driver's data held with no record of permission to hold it, so the
      // two writes are one write.
      this.privacyConsent.acceptForRegistration(
        registrationRequestId,
        privacyPolicyVersion,
        consentContext,
        tx,
      ),
    )

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
