import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, RegistrationStatus } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { assertWithinArmenia } from '../common/coordinates'
import { IMAGE_ORDER } from '../images/image-order'
import { PrismaService } from '../prisma/prisma.service'
import type { RegistrationWithImages } from '../registration/registration.repository'
import { ReviewsRepository, ReviewWithTruck } from '../reviews/reviews.repository'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { telegramTokenFingerprint } from '../telegram/token-fingerprint'
import { TelegramService } from '../telegram/telegram.service'
import { AVAILABLE_24_7_SLUG } from '../tow-trucks/service-slugs'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { AdminTowTruckSummary, toAdminTowTruckSummary } from './admin-tow-truck.mapper'
import type { AdminListQuery, AdminRegistrationsQuery } from './dto/admin-list.query'
import type { ApproveRegistrationDto } from './dto/approve-registration.dto'

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
  ) {}

  listRegistrations(query: AdminRegistrationsQuery): Promise<RegistrationWithImages[]> {
    return this.prisma.registrationRequest.findMany({
      where: query.status ? { status: query.status } : undefined,
      // Driver's own order — main photo first (see IMAGE_ORDER)
      include: { images: { orderBy: IMAGE_ORDER } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    })
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
            manipulator: request.manipulator,
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
            // Straight copy, like platformLengthM/platformWidthM — the request
            // stores the same two Decimal columns, already validated at submit
            // time (CreateRegistrationDto + assertWithinArmenia). The admin
            // does not re-enter them; if they are wrong, the correction path is
            // PATCH /admin/tow-trucks/:id/coordinates after approval.
            latitude: request.latitude,
            longitude: request.longitude,
            // Requests submitted before coordinates existed carry none, and a
            // timestamp for a location that was never set would be a lie —
            // `locationUpdatedAt` is null exactly when the pair is.
            locationUpdatedAt: request.latitude !== null ? new Date() : null,
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
   * Telegram for OTP login. Safe to call again later if the original link
   * expired (7 days) or was lost before the driver used it.
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
