import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, RegistrationStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { RegistrationWithImages } from '../registration/registration.repository'
import { ReviewsRepository, ReviewWithTruck } from '../reviews/reviews.repository'
import type { ApproveRegistrationDto } from './dto/approve-registration.dto'

const DEFAULT_DESCRIPTION = (locationName: string): string =>
  `Էվակուատորի ծառայություններ ${locationName}ում և հարակից բնակավայրերում։`

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewsRepository: ReviewsRepository,
  ) {}

  listRegistrations(status?: RegistrationStatus): Promise<RegistrationWithImages[]> {
    return this.prisma.registrationRequest.findMany({
      where: status ? { status } : undefined,
      include: { images: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** Turns an approved request into a live TowTruck profile */
  async approve(id: number, dto: ApproveRegistrationDto): Promise<{ towTruckId: number }> {
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

    return { towTruckId: towTruck.id }
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
