import { Injectable } from '@nestjs/common'
import type { Prisma, Review } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type ReviewWithTruck = Review & { towTruck: { slug: string; driverName: string } }

/** One row per moderation state — feeds the dashboard's review/rating counters */
export interface ReviewApprovalStats {
  isApproved: boolean
  count: number
  /** Mean of `rating` in this group, null when the group is empty */
  averageRating: number | null
}

/** One row per tow truck — approved reviews only, for the public listing */
export interface TowTruckRatingRow {
  towTruckId: number
  count: number
  averageRating: number
}

/** One row per (star value, moderation state) — feeds the rating histogram */
export interface ReviewRatingBucket {
  rating: number
  isApproved: boolean
  count: number
}

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

  /** Unapproved reviews awaiting moderation, newest first — paginated for the admin panel */
  listPending(page: { limit: number; offset: number }): Promise<ReviewWithTruck[]> {
    return this.prisma.review.findMany({
      where: { isApproved: false },
      include: { towTruck: { select: { slug: true, driverName: true } } },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    })
  }

  approve(id: number): Promise<Review> {
    return this.prisma.review.update({ where: { id }, data: { isApproved: true } })
  }

  /**
   * Every review of one tow truck, newest first, INCLUDING unapproved ones.
   *
   * Unlike findApprovedByTowTruckId (public profile), this is only ever reached
   * behind a driver/admin guard — a driver is allowed to read a review of
   * themselves before an admin has published it, a visitor is not.
   */
  findAllByTowTruckId(
    towTruckId: number,
    options: { isApproved?: boolean; limit: number },
  ): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: {
        towTruckId,
        ...(options.isApproved === undefined ? {} : { isApproved: options.isApproved }),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    })
  }

  /**
   * Counts + mean rating per moderation state in a single grouped query — two
   * rows at most, computed in Postgres. The alternative (four separate
   * count/avg calls, or fetching the reviews and reducing in Node) would be
   * four round-trips for the same two numbers.
   */
  async groupStatsByApproval(towTruckId: number): Promise<ReviewApprovalStats[]> {
    const rows = await this.prisma.review.groupBy({
      by: ['isApproved'],
      where: { towTruckId },
      _count: { _all: true },
      _avg: { rating: true },
    })

    return rows.map((row) => ({
      isApproved: row.isApproved,
      count: row._count._all,
      averageRating: row._avg.rating,
    }))
  }

  /**
   * Approved count + mean rating for a whole page of tow trucks, in ONE query.
   *
   * Used by the public listing, which is the hottest read in the system: doing
   * this per truck would be a textbook N+1 (one extra round-trip per card, 200
   * of them on a full page). Grouped in Postgres instead, it is a single
   * indexed pass over `Review(towTruckId)` returning at most one row per truck.
   *
   * Unapproved reviews are excluded, exactly like the public review list —
   * a rating nobody can read must not move a number everybody can see.
   */
  async groupApprovedByTowTruckIds(towTruckIds: number[]): Promise<TowTruckRatingRow[]> {
    if (towTruckIds.length === 0) return []

    const rows = await this.prisma.review.groupBy({
      by: ['towTruckId'],
      where: { towTruckId: { in: towTruckIds }, isApproved: true },
      _count: { _all: true },
      _avg: { rating: true },
    })

    return rows.map((row) => ({
      towTruckId: row.towTruckId,
      count: row._count._all,
      averageRating: row._avg.rating ?? 0,
    }))
  }

  /** Star-value histogram, split by moderation state — one grouped query, ≤10 rows */
  async groupByRating(towTruckId: number): Promise<ReviewRatingBucket[]> {
    const rows = await this.prisma.review.groupBy({
      by: ['rating', 'isApproved'],
      where: { towTruckId },
      _count: { _all: true },
    })

    return rows.map((row) => ({
      rating: row.rating,
      isApproved: row.isApproved,
      count: row._count._all,
    }))
  }

  delete(id: number): Promise<Review> {
    return this.prisma.review.delete({ where: { id } })
  }
}
