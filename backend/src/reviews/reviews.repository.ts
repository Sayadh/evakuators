import { Injectable } from '@nestjs/common'
import type { Prisma, Review } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type ReviewWithTruck = Review & { towTruck: { slug: string; driverName: string } }

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

  findById(id: number): Promise<Review | null> {
    return this.prisma.review.findUnique({ where: { id } })
  }

  /** Unapproved reviews awaiting moderation, newest first */
  listPending(): Promise<ReviewWithTruck[]> {
    return this.prisma.review.findMany({
      where: { isApproved: false },
      include: { towTruck: { select: { slug: true, driverName: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  approve(id: number): Promise<Review> {
    return this.prisma.review.update({ where: { id }, data: { isApproved: true } })
  }

  delete(id: number): Promise<Review> {
    return this.prisma.review.delete({ where: { id } })
  }
}
