import { Injectable, NotFoundException } from '@nestjs/common'
import type { Review } from '@prisma/client'
import type { CreateReviewDto } from './dto/create-review.dto'
import { ReviewsRepository } from './reviews.repository'

export interface ReviewApi {
  id: number
  authorName: string
  rating: number
  text: string
  cityName?: string
  date: string
}

@Injectable()
export class ReviewsService {
  constructor(private readonly repository: ReviewsRepository) {}

  async listForTowTruck(towTruckId: number): Promise<ReviewApi[]> {
    const reviews = await this.repository.findApprovedByTowTruckId(towTruckId)
    return reviews.map((review) => this.toApi(review))
  }

  /** New reviews are created unapproved and become public after moderation */
  async create(towTruckId: number, dto: CreateReviewDto): Promise<ReviewApi> {
    const exists = await this.repository.towTruckExists(towTruckId)
    if (exists === 0) {
      throw new NotFoundException(`Tow truck ${towTruckId} not found`)
    }

    const review = await this.repository.create({
      towTruckId,
      authorName: dto.authorName,
      rating: dto.rating,
      text: dto.text,
      cityName: dto.cityName,
    })

    return this.toApi(review)
  }

  private toApi(review: Review): ReviewApi {
    return {
      id: review.id,
      authorName: review.authorName,
      rating: review.rating,
      text: review.text,
      cityName: review.cityName ?? undefined,
      date: review.createdAt.toISOString(),
    }
  }
}
