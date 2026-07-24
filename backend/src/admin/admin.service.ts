import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, RegistrationStatus } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { RegistrationWithImages } from '../registration/registration.repository'
import { ReviewsRepository, ReviewWithTruck } from '../reviews/reviews.repository'
import { SupabaseStorageService } from '../storage/supabase-storage.service'
import { TelegramService } from '../telegram/telegram.service'
import { AVAILABLE_24_7_SLUG } from '../tow-trucks/service-slugs'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { AdminTowTruckSummary, toAdminTowTruckSummary } from './admin-tow-truck.mapper'
import type { ApproveRegistrationDto } from './dto/approve-registration.dto'

const DEFAULT_DESCRIPTION = (locationName: string): string =>
  `Էվակուատորի ծառայություններ ${locationName}ում և հարակից բնակավայրերում։`

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

  listRegistrations(status?: RegistrationStatus): Promise<RegistrationWithImages[]> {
    return this.prisma.registrationRequest.findMany({
      where: status ? { status } : undefined,
      include: { images: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** Turns an approved request into a live TowTruck profile */
  async approve(
    id: number,
    dto: ApproveRegistrationDto,
  ): Promise<{ towTruckId: number; telegramLinkUrl: string }> {
    const request = await this.prisma.registrationRequest.findUnique({
      where: { id },
      include: { images: true },
    })
    if (!request) throw new NotFoundException(`Registration request ${id} not found`)
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException(`Registration request ${id} is already ${request.status}`)
    }

    const serviceAreas = request.citySlugs.map((slug) => ({
      slug,
      name: slug,
      type: request.mainRegionSlug === 'yerevan' ? 'district' : 'city',
    })) satisfies Prisma.InputJsonValue

    const towTruck = await this.prisma.$transaction(async (tx) => {
      const created = await tx.towTruck.create({
        data: {
          slug: dto.slug,
          driverName: `${request.firstName} ${request.lastName}`,
          companyName: request.companyName,
          phone: request.phone,
          secondaryPhone: request.secondaryPhone,
          whatsapp: request.whatsapp ?? request.phone,
          telegram: request.telegram,
          email: request.email,
          // Derived from the services the driver picked — see service-slugs.ts.
          // RegistrationRequest never stores this as its own column.
          works24Hours: request.services.includes(AVAILABLE_24_7_SLUG),
          description: dto.description ?? DEFAULT_DESCRIPTION(dto.locationName),
          vehicleBrand: request.vehicleBrand,
          vehicleModel: request.vehicleModel,
          vehicleYear: request.vehicleYear,
          vehicleType: request.vehicleType,
          capacityTons: dto.capacityTons,
          winch: request.winch,
          manipulator: request.manipulator,
          regionSlug: request.mainRegionSlug === 'yerevan' ? null : request.mainRegionSlug,
          citySlug: dto.citySlug,
          districtSlug: dto.districtSlug,
          locationName: dto.locationName,
          services: request.services,
          serviceAreas,
          priceCityCallout: request.priceCityCallout,
          pricePerKm: request.pricePerKm,
          priceWaitingPerHour: request.priceWaitingPerHour,
          priceNightSurchargePercent: request.priceNightSurchargePercent,
          priceExtraLoading: request.priceExtraLoading,
        },
      })

      await tx.towTruckImage.updateMany({
        where: { registrationRequestId: request.id },
        data: { towTruckId: created.id },
      })

      await tx.registrationRequest.update({
        where: { id: request.id },
        data: { status: RegistrationStatus.APPROVED },
      })

      return created
    })

    const telegramLinkUrl = await this.generateTelegramLink(towTruck.id)
    return { towTruckId: towTruck.id, telegramLinkUrl }
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
    return this.telegram.buildLinkUrl(token)
  }

  async reject(id: number): Promise<{ id: number; status: RegistrationStatus }> {
    const request = await this.prisma.registrationRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException(`Registration request ${id} not found`)

    const updated = await this.prisma.registrationRequest.update({
      where: { id },
      data: { status: RegistrationStatus.REJECTED },
    })

    return { id: updated.id, status: updated.status }
  }

  listPendingReviews(): Promise<ReviewWithTruck[]> {
    return this.reviewsRepository.listPending()
  }

  /** Every tow truck, active or not — the public list only ever shows isActive: true */
  async listTowTrucks(): Promise<AdminTowTruckSummary[]> {
    const trucks = await this.towTrucksRepository.findAllForAdmin()
    return trucks.map(toAdminTowTruckSummary)
  }

  async approveReview(id: number): Promise<{ id: number; isApproved: boolean }> {
    const review = await this.reviewsRepository.findById(id)
    if (!review) throw new NotFoundException(`Review ${id} not found`)
    if (review.isApproved) {
      throw new BadRequestException(`Review ${id} is already approved`)
    }

    const updated = await this.reviewsRepository.approve(id)
    return { id: updated.id, isApproved: updated.isApproved }
  }

  /** Rejecting a review deletes it — there is no public "rejected" state to show */
  async rejectReview(id: number): Promise<{ id: number }> {
    const review = await this.reviewsRepository.findById(id)
    if (!review) throw new NotFoundException(`Review ${id} not found`)

    await this.reviewsRepository.delete(id)
    return { id }
  }

  /**
   * Deactivate (hide from public listing + block driver login/dashboard —
   * see MyTowTruckService's isActive check) or reactivate a tow truck.
   * Non-destructive: nothing is deleted, this is fully reversible.
   */
  async setTowTruckActive(id: number, isActive: boolean): Promise<{ id: number; isActive: boolean }> {
    const towTruck = await this.towTrucksRepository.findById(id)
    if (!towTruck) throw new NotFoundException(`TowTruck ${id} not found`)

    const updated = await this.towTrucksRepository.setActive(id, isActive)
    return { id: updated.id, isActive: updated.isActive }
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
    if (!towTruck) throw new NotFoundException(`TowTruck ${id} not found`)

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
