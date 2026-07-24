import { isApiEnabled, reviewRepository } from '~/repositories'
import type { CreateReviewPayload, Review } from '~/types/review'

/**
 * Mock mode has no review data to fall back to (reviews only exist once a
 * real backend + moderation flow is behind them) — an empty list is the
 * honest mock behavior, not an error.
 */
export const reviewsService = {
  listForTruck(towTruckId: number): Promise<Review[]> {
    if (!isApiEnabled()) return Promise.resolve([])
    return reviewRepository.listForTruck(towTruckId)
  },

  create(towTruckId: number, payload: CreateReviewPayload): Promise<Review> {
    return reviewRepository.create(towTruckId, payload)
  },
}
