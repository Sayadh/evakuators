import { apiFetch } from './apiClient'
import type { CreateReviewPayload, Review } from '~/types/review'

/** Public review reads/writes for a single tow truck (see backend ReviewsController) */
export const reviewRepository = {
  listForTruck(towTruckId: number): Promise<Review[]> {
    return apiFetch<Review[]>(`/tow-trucks/${towTruckId}/reviews`)
  },

  /** New reviews are created unapproved — they go through admin moderation before showing publicly */
  create(towTruckId: number, payload: CreateReviewPayload): Promise<Review> {
    return apiFetch<Review>(`/tow-trucks/${towTruckId}/reviews`, {
      method: 'POST',
      body: payload as unknown as Record<string, unknown>,
    })
  },
}
