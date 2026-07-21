import { Injectable } from '@nestjs/common'
import type { Prisma, Review } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findApprovedByTowTruckId(towTruckId: number): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { towTruckId, isApproved: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  create(data: Prisma.ReviewUncheckedCreateInput): Promise<Review> {
    return this.prisma.review.create({ data })
  }

  towTruckExists(towTruckId: number): Promise<number> {
    return this.prisma.towTruck.count({ where: { id: towTruckId, isActive: true } })
  }
}
