import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, RegistrationStatus } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { assertWithinArmenia } from '../common/coordinates'
import { assertServiceAreasWithinLimit } from '../tow-trucks/service-area-limits'
import { DriverAuthService } from '../driver-auth/driver-auth.service'
import { IMAGE_ORDER } from '../images/image-order'
import { PrismaService } from '../prisma/prisma.service'
import { ReviewsRepository, ReviewWithTruck } from '../reviews/reviews.repository'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { telegramTokenFingerprint } from '../telegram/token-fingerprint'
import { TelegramService } from '../telegram/telegram.service'
import { assertPlacementIsServed } from '../tow-trucks/placement'
import { AVAILABLE_24_7_SLUG } from '../tow-trucks/service-slugs'
import type { ServiceAreaJson } from '../tow-trucks/tow-truck.types'
import { derivesManipulator } from '../tow-trucks/vehicle-types'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import {
  AdminRegistrationSummary,
  toAdminRegistrationSummary,
} from './admin-registration.mapper'
import { AdminTowTruckSummary, toAdminTowTruckSummary } from './admin-tow-truck.mapper'
import type { AdminListQuery, AdminRegistrationsQuery } from './dto/admin-list.query'
import type { ApproveRegistrationDto } from './dto/approve-registration.dto'
import type { RemoveServiceAreaDto } from './dto/remove-service-area.dto'
import type { SetPrimaryAreaDto } from './dto/set-primary-area.dto'

const DEFAULT_DESCRIPTION = (locationName: string): string =>
  `Էվակուատորի ծառայություններ ${locationName}ում և հարակից բնակավայրերում։`

const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING]: 'սպասման մեջ',
  [RegistrationStatus.APPROVED]: 'հաստատված',
  [RegistrationStatus.REJECTED]: 'մերժված',
}

const TELEGRAM_LINK_TTL_DAYS = 7

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsRepository: ReviewsRepository,
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly telegram: TelegramService,
    private readonly storage: SupabaseStorageService,
    private readonly driverAuth: DriverAuthService,
  ) {}

  async listRegistrations(query: AdminRegistrationsQuery): Promise<AdminRegistrationSummary[]> {
    const requests = await this.prisma.registrationRequest.findMany({
      where: query.status ? { status: query.status } : undefined,
      // Driver's own order — main photo first (see IMAGE_ORDER)
      include: { images: { orderBy: IMAGE_ORDER } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    })

    // Mapped rather than returned raw, for exactly one field: the coordinate
    // pair is Decimal, which serialises as a string. See the mapper.
    return requests.map(toAdminRegistrationSummary)
  }

  /**
   * Which coordinate pair an approval writes.
   *
   * Three outcomes, and the first is the overwhelmingly common one:
   *
   * - **Neither key sent** → the driver's own pair, copied across untouched
   *   exactly as it always was. Nothing about the existing flow changes for a
   *   moderator who does not open the coordinate box.
   * - **Both sent** → the moderator's, subject to the same two checks a driver's
   *   pair gets: the DTO already proved they are numbers in range, and
   *   `assertWithinArmenia` is the geography half. An admin is not exempt —
   *   a transposed pair from an admin lands a truck in the Indian Ocean just as
   *   readily as one from a driver.
   * - **One sent** → rejected. Half a coordinate is neither "has a location"
   *   nor "has none" for every reader downstream, and silently dropping the
   *   stray half would hide a broken client instead of reporting it. Same rule,
   *   same wording as `RegistrationService`.
   *
   * There is no way to *clear* a pair here, deliberately — the same decision
   * `SetCoordinatesDto` documents. A location only ever gets corrected.
   */
  private resolveApprovalCoordinates(
    dto: ApproveRegistrationDto,
    request: { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null },
  ): { latitude: Prisma.Decimal | number | null; longitude: Prisma.Decimal | number | null } {
    const hasLatitude = dto.latitude !== undefined
    const hasLongitude = dto.longitude !== undefined

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'Կոորդինատները պետք է լրացվեն ամբողջությամբ՝ և՛ լայնությունը, և՛ երկայնությունը, կամ թողնվեն դատարկ։',
      )
    }

    if (!hasLatitude) {
      return { latitude: request.latitude, longitude: request.longitude }
    }

    assertWithinArmenia(dto.latitude as number, dto.longitude as number)

    // Plain numbers, not Decimals: Prisma accepts a number for a Decimal column
    // and rounds it to the declared scale, which is the same path
    // `setCoordinates` takes.
    return { latitude: dto.latitude as number, longitude: dto.longitude as number }
  }

  /** Turns an approved request into a live TowTruck profile */
  async approve(
    id: number,
    dto: ApproveRegistrationDto,
  ): Promise<{ towTruckId: number; telegramLinkUrl: string }> {
    const request = await this.prisma.registrationRequest.findUnique({
      where: { id },
      include: { images: { orderBy: IMAGE_ORDER } },
    })
    if (!request) throw new NotFoundException(`Հայտ #${id}-ը չի գտնվել`)
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException(
        `Այս հայտն արդեն ${REGISTRATION_STATUS_LABELS[request.status]} է, կրկին հաստատել/մերժել հնարավոր չէ`,
      )
    }

    // The main phone is the driver-login key (DriverAuthService looks a
    // truck up by it). Checked against EVERY truck, active or deactivated —
    // same reasoning as the slug check below: allowing a deactivated
    // truck's phone to be reused would silently break the moment that truck
    // is reactivated (two ACTIVE trucks sharing one login phone). A
    // secondary phone is allowed to repeat, only the main one is guarded.
    const phoneConflict = await this.towTrucksRepository.findByMainPhoneAnyStatus(request.phone)
    if (phoneConflict) {
      throw new BadRequestException(
        `Այս հեռախոսահամարով (${request.phone}) արդեն կա էվակուատոր՝ «${phoneConflict.slug}» (${phoneConflict.isActive ? 'ակտիվ' : 'ապաակտիվացված'})։ Հիմնական հեռախոսահամարը պետք է եզակի լինի։`,
      )
    }

    // slug is @unique regardless of active/deactivated status — checked
    // against EVERY truck, not just active ones, so a deactivated truck's
    // slug can never be handed to a new one (which would otherwise only
    // surface as a raw, uncaught DB constraint error) and reactivating that
    // truck later never runs into a slug someone else has since taken.
    const slugConflict = await this.towTrucksRepository.findBySlugAnyStatus(dto.slug)
    if (slugConflict) {
      throw new BadRequestException(
        `Այս slug-ն (${dto.slug}) արդեն օգտագործվում է մեկ այլ էվակուատորի կողմից (${slugConflict.isActive ? 'ակտիվ' : 'ապաակտիվացված'})։ Ընտրիր այլ slug։`,
      )
    }

    // The exact coverage rule, applied at the one moment a request turns into
    // a public listing. This is the real boundary: the registration endpoint
    // could only apply a bound (its payload has no types), so a crafted
    // submission that slipped past it is stopped here instead — before anything
    // is published, and with a message the admin can act on.
    // The region list comes from the **stored request**, never from the request
    // body. It tells 3-for-one-marz from 5-for-two, which the typed areas alone
    // cannot — and taking it from the DTO would let a caller assert two marzes
    // to unlock the looser budget for a selection that is really one. The
    // driver's own submission is already on disk here; there is no reason to ask
    // the client to repeat it.
    //
    // Requests predating `regionSlugs` carry an empty array. That is "unknown",
    // not "zero regions", so it degrades to the loose bound rather than being
    // read as one marz and rejecting a perfectly valid old submission.
    assertServiceAreasWithinLimit(
      dto.serviceAreas,
      request.regionSlugs.length > 0 ? request.regionSlugs : undefined,
    )

    // The placement the moderator picked must be one of the areas being
    // published in the same breath. It used to be inferred here instead — "the
    // first served area that is not a corridor" — which could not be wrong in a
    // way this check would catch, but also could not be *right* on purpose: the
    // order was whatever the driver ticked boxes in. Now it is a choice, so it
    // is a choice that can be mistaken, so it is checked.
    assertPlacementIsServed(dto.serviceAreas, dto)

    // The coordinate pair the truck will be created with. Omitting both keys —
    // the normal case — keeps whatever the driver sent at registration.
    const coordinates = this.resolveApprovalCoordinates(dto, request)

    // Resolved to real Armenian names by the admin frontend (no geography
    // data lives in the backend) — see ServiceAreaDto in approve-registration.dto.ts
    const serviceAreas = dto.serviceAreas.map((area) => ({
      slug: area.slug,
      name: area.name,
      type: area.type,
    })) satisfies Prisma.InputJsonValue

    const towTruck = await this.createTowTruckOrRethrowPhoneConflict(request.phone, () =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.towTruck.create({
          data: {
            slug: dto.slug,
            driverName: `${request.firstName} ${request.lastName}`,
            companyName: request.companyName,
            phone: request.phone,
            secondaryPhone: request.secondaryPhone,
            // NOT `?? request.phone`. Defaulting it meant every approved truck
            // had a WhatsApp number whether or not the driver uses WhatsApp, so
            // the button showed on every card and profile — sending customers
            // to a chat nobody reads, and firing a "someone opened your
            // WhatsApp" Telegram notice at a driver who has none. An empty
            // field in the registration form means "I don't use WhatsApp";
            // that is the answer, and it is the one we store.
            whatsapp: request.whatsapp ?? null,
            telegram: request.telegram,
            email: request.email,
            // Derived from the services the driver picked — see service-slugs.ts.
            // RegistrationRequest never stores this as its own column.
            works24Hours: request.services.includes(AVAILABLE_24_7_SLUG),
            workingHoursText: request.workingHoursText,
            description: dto.description ?? DEFAULT_DESCRIPTION(dto.locationName),
            vehicleBrand: request.vehicleBrand,
            vehicleModel: request.vehicleModel,
            vehicleYear: request.vehicleYear,
            vehicleType: request.vehicleType,
            capacityTons: dto.capacityTons,
            // Straight copy, same as winch/manipulator — the request stores these
            // as the same two Float columns. They used to be one free-text field
            // that approval never read at all, so the driver's answer was
            // collected and silently thrown away.
            platformLengthM: request.platformLengthM,
            platformWidthM: request.platformWidthM,
            winch: request.winch,
            // Derived, not copied — see vehicle-types.ts. Picking the
            // «Մանիպուլյատորով էվակուատոր» type already answers this, and a
            // driver who answered only that way used to be invisible to the
            // «Մանիպուլյատոր» filter. Same treatment works24Hours gets above.
            manipulator: derivesManipulator(request.vehicleType, request.manipulator),
            wheelSkates: request.wheelSkates,
            // Resolved by the admin frontend from the chosen citySlug/districtSlug
            // (see ApproveRegistrationDto.regionSlug) — the backend has no
            // geography of its own, and with up to 2 regionSlugs on the request
            // it can no longer just take "the" region the way a single
            // mainRegionSlug used to allow.
            regionSlug: dto.regionSlug ?? null,
            citySlug: dto.citySlug,
            districtSlug: dto.districtSlug,
            locationName: dto.locationName,
            // Usually a straight copy of what the driver sent, occasionally the
            // moderator's correction — see resolveApprovalCoordinates.
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            // Requests submitted before coordinates existed carry none, and a
            // timestamp for a location that was never set would be a lie —
            // `locationUpdatedAt` is null exactly when the pair is.
            locationUpdatedAt: coordinates.latitude !== null ? new Date() : null,
            services: request.services,
            serviceAreas,
            priceCityCallout: request.priceCityCallout,
            pricePerKm: request.pricePerKm,
            priceWaitingPerHour: request.priceWaitingPerHour,
            priceNightSurchargePercent: request.priceNightSurchargePercent,
            priceExtraLoading: request.priceExtraLoading,
          },
        })

        // Only re-points the owner — `position` was already written from the
        // driver's own order when the request was created (see
        // RegistrationRepository.create) and must survive approval untouched,
        // otherwise the main photo they picked stops being the main photo the
        // moment their profile goes live.
        await tx.towTruckImage.updateMany({
          where: { registrationRequestId: request.id },
          data: { towTruckId: created.id },
        })

        await tx.registrationRequest.update({
          where: { id: request.id },
          data: { status: RegistrationStatus.APPROVED },
        })

        return created
      }),
    )

    const telegramLinkUrl = await this.generateTelegramLink(towTruck.id)
    return { towTruckId: towTruck.id, telegramLinkUrl }
  }

  /**
   * Runs a write that sets `TowTruck.phone` and turns the database's own
   * uniqueness verdict into the same Armenian message the pre-check produces.
   *
   * Both write paths already look the phone up first, which gives a friendly,
   * context-rich error — but a check followed by a write has a race window,
   * and `TowTruck.phone` is `@unique` precisely so that window cannot produce
   * two trucks sharing one login key. When the constraint is what catches it,
   * Prisma raises P2002, which would otherwise surface as an uncaught 500.
   *
   * `meta.target` is checked so this never swallows a different unique
   * violation — `slug`, `telegramChatId` and `telegramLinkToken` are all
   * `@unique` on the same model and must keep failing loudly.
   */
  private async createTowTruckOrRethrowPhoneConflict<T>(
    phone: string,
    write: () => Promise<T>,
  ): Promise<T> {
    try {
      return await write()
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        this.conflictTargets(error).includes('phone')
      ) {
        throw new BadRequestException(
          `Այս հեռախոսահամարով (${phone}) արդեն կա էվակուատոր։ Հիմնական հեռախոսահամարը պետք է եզակի լինի։`,
        )
      }
      throw error
    }
  }

  /** P2002's `meta.target` is a string[] on Postgres, but typed as unknown */
  private conflictTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
    const target = error.meta?.target
    if (Array.isArray(target)) return target.map(String)
    return typeof target === 'string' ? [target] : []
  }

  /**
   * (Re)generates the one-time t.me deep-link a driver taps to connect their
   * Telegram. Tapping it links `telegramChatId` and, if the driver has no
   * password of their own yet, mints and sends one in the same exchange (see
   * `TelegramWebhookController.handleStart`). Safe to call again later if the
   * original link expired (7 days) or was lost before the driver used it.
   */
  async generateTelegramLink(towTruckId: number): Promise<string> {
    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TTL_DAYS * 24 * 60 * 60 * 1000)
    await this.towTrucksRepository.setTelegramLinkToken(towTruckId, token, expiresAt)
    // A fingerprint, never the token itself, and never a prefix of it — a
    // prefix is still part of a live 7-day credential. The hash is stable, so
    // this line still answers the only question it exists for: when a driver
    // reports "link is invalid", the fingerprint here can be compared with the
    // one TelegramWebhookController logs for the token they actually tapped.
    this.logger.log(
      `Generated Telegram link token for TowTruck #${towTruckId}: ` +
        `fp=${telegramTokenFingerprint(token)} (expires ${expiresAt.toISOString()})`,
    )
    return this.telegram.buildLinkUrl(token)
  }

  /**
   * Who could be handed a password right now: linked Telegram, no password yet.
   *
   * Read-only and side-effect free, which is the point — an admin sees the
   * exact list before anything is sent, and can send to some of it. A Telegram
   * message cannot be unsent, so the panel never asks anyone to press a button
   * whose blast radius they have not been shown.
   *
   * `telegramChatId` is dropped here: it is a BigInt (which `JSON.stringify`
   * throws on outright) and the panel has no use for it — "linked" is already
   * implied by being on this list at all. Same reasoning as
   * `AdminTowTruckSummary.hasTelegramLinked`.
   */
  async listPasswordCandidates(): Promise<
    Array<{ id: number; slug: string; driverName: string; phone: string }>
  > {
    const candidates = await this.towTrucksRepository.findLinkedWithoutPassword()
    return candidates.map(({ id, slug, driverName, phone }) => ({ id, slug, driverName, phone }))
  }

  /**
   * Hands a temporary password to the drivers an admin explicitly selected.
   *
   * ## Why this takes ids rather than doing "everyone"
   *
   * It used to send to the whole candidate list on one press. That is the wrong
   * shape for an action whose effect leaves the system: on staging — whose
   * database is a copy of production's, with real drivers' real chat ids — a
   * misfire means dozens of real people receive a real message containing a
   * password that only works on staging. Naming the recipients makes the blast
   * radius a decision instead of a default.
   *
   * ## The requested list is a filter, never a source of truth
   *
   * `towTruckIds` is intersected with the freshly-read candidate list, so an id
   * that is not genuinely eligible — already has a password, no Telegram
   * linked, does not exist — is skipped rather than acted on. That matters
   * beyond tidiness: without it, this endpoint would be a way to reset an
   * arbitrary driver's password by id. (`issueTemporaryPassword` refuses a
   * driver who owns their password anyway, so this is the second of two locks,
   * not the only one.)
   *
   * Each driver is independent — one failed Telegram send (a chat the driver
   * has since blocked) must not stop the rest, so failures are caught per-row
   * and reported back rather than thrown.
   */
  async issuePasswordsForLinkedDrivers(towTruckIds: number[]): Promise<{
    issued: number
    failed: Array<{ id: number; slug: string }>
    /** Requested but no longer eligible — the list an admin saw can go stale between load and send */
    skipped: number
  }> {
    const candidates = await this.towTrucksRepository.findLinkedWithoutPassword()
    const eligible = new Map(candidates.map((truck) => [truck.id, truck]))

    const failed: Array<{ id: number; slug: string }> = []
    let issued = 0
    let skipped = 0

    // Iterating the REQUESTED ids, not the candidate list — so the loop can
    // only ever touch someone the admin named, and the intersection is what
    // decides eligibility.
    for (const id of towTruckIds) {
      const truck = eligible.get(id)
      if (!truck) {
        skipped += 1
        continue
      }

      try {
        const password = await this.driverAuth.issueTemporaryPassword(truck.id)
        // Cannot be null here — the id came from a query that filtered on
        // `passwordHash: null` moments ago — but a driver who set their own
        // password in that gap is exactly the race this guards, and skipping
        // is the correct outcome for it.
        if (!password) {
          skipped += 1
          continue
        }

        await this.telegram.sendMessage(
          truck.telegramChatId,
          `Բարև, ${truck.driverName}։ Evakuators.am-ի մուտքի եղանակը փոխվեց. այսուհետ մուտք ` +
            'եք գործում հեռախոսահամարով և գաղտնաբառով, Telegram-ի կոդի փոխարեն։\n\n' +
            `Հեռախոսահամար՝ ${truck.phone}\n` +
            `Ժամանակավոր գաղտնաբառ՝ ${password}\n\n` +
            'Մուտք գործելուց հետո համակարգը կխնդրի փոխել գաղտնաբառը՝ Ձեր նախընտրածով։ ' +
            'Այս գաղտնաբառը ոչ ոքի մի՛ փոխանցեք։',
          { text: 'Մուտք գործել', url: this.telegram.loginUrl },
        )
        issued += 1
      } catch (error) {
        const err = error as Error
        this.logger.error(
          `issuePasswordsForLinkedDrivers: failed for TowTruck #${truck.id}: ${err.message}`,
        )
        failed.push({ id: truck.id, slug: truck.slug })
      }
    }

    this.logger.log(
      `issuePasswordsForLinkedDrivers: requested ${towTruckIds.length}, ` +
        `issued ${issued}, failed ${failed.length}, skipped ${skipped}`,
    )
    return { issued, failed, skipped }
  }

  async reject(id: number): Promise<{ id: number; status: RegistrationStatus }> {
    const request = await this.prisma.registrationRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException(`Հայտ #${id}-ը չի գտնվել`)
    // Same guard approve() has, and for the same reason: a request that has
    // already been decided must not be re-decided. Without it an APPROVED
    // request could be flipped to REJECTED while the TowTruck created from it
    // stays live, which makes the audit trail state something that never
    // happened — and puts the row into the status the orphaned-image purge
    // treats as "photos are of no further use".
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException(
        `Այս հայտն արդեն ${REGISTRATION_STATUS_LABELS[request.status]} է, կրկին հաստատել/մերժել հնարավոր չէ`,
      )
    }

    const updated = await this.prisma.registrationRequest.update({
      where: { id },
      data: { status: RegistrationStatus.REJECTED },
    })

    return { id: updated.id, status: updated.status }
  }

  listPendingReviews(query: AdminListQuery): Promise<ReviewWithTruck[]> {
    return this.reviewsRepository.listPending(query)
  }

  /** Every tow truck, active or not — the public list only ever shows isActive: true */
  async listTowTrucks(query: AdminListQuery): Promise<AdminTowTruckSummary[]> {
    const trucks = await this.towTrucksRepository.findAllForAdmin(query)
    return trucks.map(toAdminTowTruckSummary)
  }

  /**
   * The totals behind the paginated list above — the admin panel can otherwise
   * only report how many rows it has fetched so far, never how many exist.
   */
  countTowTrucks(): Promise<{ total: number; active: number; inactive: number }> {
    return this.towTrucksRepository.countForAdmin()
  }

  async approveReview(id: number): Promise<{ id: number; isApproved: boolean }> {
    const review = await this.reviewsRepository.findById(id)
    if (!review) throw new NotFoundException(`Կարծիք #${id}-ը չի գտնվել`)
    if (review.isApproved) {
      throw new BadRequestException(`Կարծիք #${id}-ն արդեն հաստատված է`)
    }

    const updated = await this.reviewsRepository.approve(id)
    return { id: updated.id, isApproved: updated.isApproved }
  }

  /** Rejecting a review deletes it — there is no public "rejected" state to show */
  async rejectReview(id: number): Promise<{ id: number }> {
    const review = await this.reviewsRepository.findById(id)
    if (!review) throw new NotFoundException(`Կարծիք #${id}-ը չի գտնվել`)

    await this.reviewsRepository.delete(id)
    return { id }
  }

  /**
   * Deactivate (hide from public listing + block driver login/dashboard —
   * see MyTowTruckService's isActive check) or reactivate a tow truck.
   * Non-destructive: nothing is deleted, this is fully reversible.
   *
   * Deactivating never needs a phone check — it only ever REDUCES the active
   * count. Reactivating does: approve()/submit()/setTowTruckPhone() all now
   * block a phone from ever being reused across trucks regardless of status,
   * so this should be unreachable going forward — but it's the one path that
   * could still resurrect a duplicate from data created before that
   * invariant existed, so it's checked here too rather than assumed safe.
   */
  async setTowTruckActive(id: number, isActive: boolean): Promise<{ id: number; isActive: boolean }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${id}-ը չի գտնվել`)

    if (isActive) {
      const conflict = await this.towTrucksRepository.findByMainPhoneAnyStatus(towTruck.phone, id)
      if (conflict && conflict.isActive) {
        throw new BadRequestException(
          `Այս էվակուատորի հեռախոսահամարով (${towTruck.phone}) արդեն կա ակտիվ էվակուատոր՝ «${conflict.slug}»։ Նախ փոխիր հեռախոսահամարներից մեկը, հետո ակտիվացրու։`,
        )
      }
    }

    const updated = await this.towTrucksRepository.setActive(id, isActive)
    return { id: updated.id, isActive: updated.isActive }
  }

  /**
   * Admin correction of the main login phone — e.g. a driver mistyped it at
   * registration and there's no self-service way to fix it (MyTowTruckService
   * never exposes `phone`, only `secondaryPhone`/`whatsapp`, since the main
   * phone doubles as the driver-login lookup key). Same uniqueness rule as
   * approve(): checked against EVERY other truck regardless of
   * active/deactivated status, or a later reactivation could silently create
   * two active trucks sharing one login phone.
   */
  async setTowTruckPhone(id: number, phone: string): Promise<{ id: number; phone: string }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${id}-ը չի գտնվել`)

    if (phone !== towTruck.phone) {
      const conflict = await this.towTrucksRepository.findByMainPhoneAnyStatus(phone, id)
      if (conflict) {
        throw new BadRequestException(
          `Այս հեռախոսահամարով (${phone}) արդեն կա էվակուատոր՝ «${conflict.slug}» (${conflict.isActive ? 'ակտիվ' : 'ապաակտիվացված'})։ Հիմնական հեռախոսահամարը պետք է եզակի լինի։`,
        )
      }
    }

    // Second write path that sets `phone`, so it gets the same P2002 net as
    // approve() — the pre-check above can lose a race, the constraint cannot.
    const updated = await this.createTowTruckOrRethrowPhoneConflict(phone, () =>
      this.towTrucksRepository.setPhone(id, phone),
    )
    return { id: updated.id, phone: updated.phone }
  }

  /**
   * Removes ONE served area from an already-approved truck.
   *
   * ## Why the coverage cap is deliberately not applied here
   *
   * `assertServiceAreasWithinLimit` guards the two paths that can *grow* a
   * coverage list. This one can only shrink it, so the cap could never reject a
   * legitimate call — but it could reject an entirely correct one, and that is
   * the reason to leave it out rather than an omission.
   *
   * Drivers approved before the cap existed keep their old lists (that was the
   * explicit decision: do not touch stored data, ask for a trim on the next
   * save). Several of them hold 8-10 areas. Running the cap here would throw on
   * the *result* of the very first removal — 9 areas is still over the limit —
   * so the exact drivers an admin most needs to trim would be the only ones
   * whose areas could not be trimmed at all. The rule the write actually needs
   * is "strictly fewer than before", and dropping one entry from the stored list
   * satisfies that by construction.
   *
   * ## The last area
   *
   * Refused. A truck with an empty `serviceAreas` matches no city, district or
   * marz filter, so it silently vanishes from every browsing page while still
   * looking live in the panel — a deactivation nobody performed and nothing
   * displays. Hiding a driver is what `setTowTruckActive(id, false)` is for, and
   * the error says so.
   */
  async removeTowTruckServiceArea(
    id: number,
    dto: RemoveServiceAreaDto,
  ): Promise<{
    id: number
    serviceAreas: ServiceAreaJson[]
    citySlug?: string
    districtSlug?: string
    regionSlug?: string
  }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${id}-ը չի գտնվել`)

    const areas = (towTruck.serviceAreas as unknown as ServiceAreaJson[]) ?? []
    const target = areas.find((area) => area.slug === dto.slug)

    // Not a 404: the truck exists, and the usual cause is a panel left open
    // while someone else removed the same area. Saying so is more useful than
    // "not found", which reads as if the truck were gone.
    if (!target) {
      throw new BadRequestException(
        `«${dto.slug}» տարածքը այս էվակուատորի ցանկում չկա։ Հնարավոր է՝ այն արդեն հեռացվել է — թարմացրեք էջը։`,
      )
    }

    // Compared by slug, not by identity: two entries could in principle share a
    // slug (nothing has ever enforced uniqueness inside the JSON), and removing
    // "the one the admin clicked" would then leave a duplicate behind that the
    // panel still shows. Dropping every match makes the button's promise true.
    const remaining = areas.filter((area) => area.slug !== dto.slug)

    if (remaining.length === 0) {
      throw new BadRequestException(
        'Էվակուատորը պետք է սպասարկի առնվազն մեկ տարածք։ Եթե ուզում եք ամբողջությամբ թաքցնել պրոֆիլը, օգտագործեք «Ապաակտիվացնել» կոճակը։',
      )
    }

    const placement = this.resolvePlacementAfterRemoval(towTruck, dto, remaining)

    const updated = await this.towTrucksRepository.setServiceAreas(
      id,
      // Mapped to plain objects rather than written straight back: what came out
      // of the column is `JsonValue`, and re-narrowing it here means the row can
      // only ever be rewritten with the three keys this shape is documented to
      // hold, whatever an older row happened to carry.
      remaining.map((area) => ({ slug: area.slug, name: area.name, type: area.type })),
      placement,
    )

    // Read back from the row, like setTowTruckCoordinates — the panel patches
    // its list from this, so it must show what is stored, not what was inferred.
    return {
      id: updated.id,
      serviceAreas: (updated.serviceAreas as unknown as ServiceAreaJson[]) ?? [],
      citySlug: updated.citySlug ?? undefined,
      districtSlug: updated.districtSlug ?? undefined,
      regionSlug: updated.regionSlug ?? undefined,
    }
  }

  /**
   * Where the truck is filed after the removal.
   *
   * Two cases, and the boring one is the common one: if the area being removed
   * is not the truck's placement, the placement does not change. The DTO's
   * placement fields are ignored outright in that case — relocating a driver is
   * `approve()`'s job and the dashboard's, and letting a removal quietly carry
   * one would make this a second, undocumented way to move a truck between
   * cities.
   *
   * When the placement IS what is being removed, it has to be re-pointed, and
   * the replacement can only come from the caller: choosing one means knowing
   * which surviving slug is a settlement and which is a road corridor — a truck
   * cannot be "based in" «Գառնի–Գեղարդ» — and that is geography, which this
   * backend does not have (CLAUDE.md). What it *can* do without any geography is
   * check the answer against the list it just wrote, which is what happens here.
   */
  private resolvePlacementAfterRemoval(
    towTruck: { citySlug: string | null; districtSlug: string | null; regionSlug: string | null },
    dto: RemoveServiceAreaDto,
    remaining: readonly ServiceAreaJson[],
  ): { citySlug: string | null; districtSlug: string | null; regionSlug: string | null } {
    const removedThePlacement =
      towTruck.citySlug === dto.slug || towTruck.districtSlug === dto.slug

    if (!removedThePlacement) {
      return {
        citySlug: towTruck.citySlug,
        districtSlug: towTruck.districtSlug,
        regionSlug: towTruck.regionSlug,
      }
    }

    const replacement = dto.citySlug ?? dto.districtSlug

    // No replacement offered. Allowed, and it means exactly one thing: nothing
    // that survives can BE a placement — the truck is left covering only road
    // corridors. Both columns are nullable for that case and `findPlaceSlug` on
    // the frontend returns undefined for it, so this is the same state a driver
    // can already reach; refusing would just make an admin unable to finish a
    // cleanup the data model permits.
    if (!replacement) {
      return { citySlug: null, districtSlug: null, regionSlug: null }
    }

    // The shared rule — checked against the areas that SURVIVE, not the ones
    // that were stored, so a replacement pointing at the very area being
    // removed is rejected too. Not taken on trust just because the caller is an
    // admin: this is the state the whole endpoint exists to avoid.
    assertPlacementIsServed(remaining, dto)

    return {
      citySlug: dto.citySlug ?? null,
      districtSlug: dto.districtSlug ?? null,
      // Yerevan is a pseudo-region and its districts carry no marz, so a
      // district replacement nulls this rather than keeping the old value —
      // otherwise a truck moving into Yerevan would stay listed on the marz page
      // it left.
      regionSlug: dto.districtSlug ? null : (dto.regionSlug ?? null),
    }
  }

  /**
   * Sets which single place an approved truck is **based** in.
   *
   * This is not cosmetic. City pages order locally-based drivers above the ones
   * who merely also cover the town (`sortTowTrucks` on the frontend), so this
   * value decides who a customer sees first — which is exactly why it stopped
   * being inferred from "the first area the driver happened to tick" and became
   * something a moderator states.
   *
   * Works on deactivated trucks too, for the same reason `setTowTruckPhone`
   * does: deactivating hides a profile, it does not freeze the record.
   */
  async setTowTruckPrimaryArea(
    id: number,
    dto: SetPrimaryAreaDto,
  ): Promise<{
    id: number
    locationName: string
    citySlug?: string
    districtSlug?: string
    regionSlug?: string
  }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${id}-ը չի գտնվել`)

    // Required here, unlike in the removal path. There the empty placement is a
    // real outcome (nothing left that could be one); here an admin has opened a
    // picker whose entire purpose is to choose one, so an empty submission is a
    // mistake rather than an answer.
    if (!dto.citySlug && !dto.districtSlug) {
      throw new BadRequestException('Ընտրեք հիմնական քաղաքը կամ Երևանի շրջանը։')
    }

    const areas = (towTruck.serviceAreas as unknown as ServiceAreaJson[]) ?? []
    assertPlacementIsServed(areas, dto)

    const updated = await this.towTrucksRepository.setPrimaryArea(id, {
      citySlug: dto.citySlug ?? null,
      districtSlug: dto.districtSlug ?? null,
      // Yerevan is a pseudo-region and its districts have no marz, so a district
      // placement nulls this — otherwise a truck moving into Yerevan would stay
      // listed on the marz page it left.
      regionSlug: dto.districtSlug ? null : (dto.regionSlug ?? null),
      locationName: dto.locationName.trim(),
    })

    return {
      id: updated.id,
      locationName: updated.locationName,
      citySlug: updated.citySlug ?? undefined,
      districtSlug: updated.districtSlug ?? undefined,
      regionSlug: updated.regionSlug ?? undefined,
    }
  }

  /**
   * Admin correction of a truck's base parking coordinates.
   *
   * Exists alongside the driver's own `PATCH /my/tow-truck/coordinates` for the
   * same reason `setTowTruckPhone` exists alongside the dashboard: some drivers
   * will paste the pair in the wrong order, or in the wrong place entirely, and
   * support needs a way to fix it without asking them to log in. Unlike the
   * phone, this is NOT admin-only — the driver owns the value too; this is a
   * second door to the same field, not the only one.
   *
   * Works on deactivated trucks as well. An admin correcting the record of a
   * profile they have temporarily hidden is a normal thing to want, and
   * refusing it would only mean deactivating had quietly frozen data an admin
   * is otherwise free to edit.
   */
  async setTowTruckCoordinates(
    id: number,
    latitude: number,
    longitude: number,
  ): Promise<{ id: number; latitude: number; longitude: number; locationUpdatedAt: string }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${id}-ը չի գտնվել`)

    assertWithinArmenia(latitude, longitude)

    const updated = await this.towTrucksRepository.setCoordinates(id, latitude, longitude)
    return {
      id: updated.id,
      // Read back from the row rather than echoed from the request: the column
      // is DECIMAL(9,6), so what was stored is what the panel must display —
      // otherwise a value that got rounded on the way in would keep showing its
      // unrounded self until the next full page load.
      latitude: Number(updated.latitude),
      longitude: Number(updated.longitude),
      locationUpdatedAt: (updated.locationUpdatedAt as Date).toISOString(),
    }
  }

  /**
   * Marks/unmarks a tow truck as one of the homepage "best tow trucks" picks.
   * Purely editorial — has no effect on public search/filter results, and an
   * inactive truck stays hidden from the homepage regardless of this flag
   * (see TowTrucksRepository.findFeatured).
   */
  async setTowTruckFeatured(
    id: number,
    isFeatured: boolean,
  ): Promise<{ id: number; isFeatured: boolean }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${id}-ը չի գտնվել`)

    const updated = await this.towTrucksRepository.setFeatured(id, isFeatured)
    return { id: updated.id, isFeatured: updated.isFeatured }
  }

  /**
   * Permanently deletes a tow truck and everything that belongs to it:
   * images (DB row + the actual Supabase Storage files), reviews, and any
   * pending driver-login OTPs. DB-side relations cascade automatically
   * (see schema.prisma), Storage does not — we clean that up explicitly here.
   * Irreversible. Prefer setTowTruckActive(id, false) unless the admin
   * specifically wants the data gone.
   */
  async deleteTowTruck(id: number): Promise<{ id: number }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${id}-ը չի գտնվել`)

    if (towTruck.images.length > 0) {
      try {
        await this.storage.remove(towTruck.images.map((image) => image.path))
      } catch (error) {
        // Don't let a Storage hiccup block a deletion the admin explicitly
        // requested — worst case a handful of orphan files sit in the bucket,
        // which is far better than a truck the admin can't get rid of.
        this.logger.warn(
          `Failed to remove Storage objects for TowTruck ${id}, continuing with DB delete: ${String(error)}`,
        )
      }
    }

    await this.towTrucksRepository.delete(id)
    return { id }
  }
}
