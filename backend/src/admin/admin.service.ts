import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, RegistrationStatus } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { RegistrationWithImages } from '../registration/registration.repository'
import { ReviewsRepository, ReviewWithTruck } from '../reviews/reviews.repository'
import { TelegramService } from '../telegram/telegram.service'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import type { ApproveRegistrationDto } from './dto/approve-registration.dto'

const DEFAULT_DESCRIPTION = (locationName: string): string =>
  `Էվակուատորի ծառայություններ ${locationName}ում և հարակից բնակավայրերում։`

const TELEGRAM_LINK_TTL_DAYS = 7

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsRepository: ReviewsRepository,
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly telegram: TelegramService,
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
          works24Hours: request.works24Hours,
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
}
