import type { CreatedPromotionPayment, PromotionStatus } from '~/types/promotion'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { apiFetch } from './apiClient'

/** The driver's own placement — every route here acts on the caller, by session */
export const myPromotionRepository = {
  getStatus(): Promise<PromotionStatus> {
    return apiFetch<PromotionStatus>('/my/promotion', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  /**
   * The whole body is a number of days. The price is the server's to decide —
   * and sending an amount would be REJECTED, not ignored, since the backend's
   * ValidationPipe runs with `forbidNonWhitelisted`.
   */
  createPayment(days: number): Promise<CreatedPromotionPayment> {
    return apiFetch<CreatedPromotionPayment>('/my/promotion/payments', {
      method: 'POST',
      body: { days },
      headers: useDriverAuthStore().authHeader,
    })
  },

  /** «Թարմացնել» — answers with the fresh status, so the caller needs no second read */
  refresh(): Promise<PromotionStatus> {
    return apiFetch<PromotionStatus>('/my/promotion/refresh', {
      method: 'POST',
      headers: useDriverAuthStore().authHeader,
    })
  },
}
