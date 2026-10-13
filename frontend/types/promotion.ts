/** Mirrors backend `PromotionPriceBracket` — one band of the marginal ladder */
export interface PromotionPriceBracket {
  fromDay: number
  toDay: number
  pricePerDay: number
}

/** Why the block cannot sell anything right now. Mirrors backend `PromotionBlockedReason`. */
export type PromotionBlockedReason = 'inactive' | 'no-subscription'

/** Mirrors backend `PromotionStatusApi` */
export interface PromotionStatus {
  /** False only for a deactivated listing, and then the block is not rendered at all */
  visible: boolean
  blockedReason?: PromotionBlockedReason
  activeUntil?: string
  lastRefreshedAt?: string
  refreshesLeft: number
  refreshesPerDay: number
  /**
   * The largest order on sale right now — bounded by the subscription, because
   * a placement may not outlive the access it decorates. Zero means nothing is
   * for sale today.
   */
  maxDays: number
  /**
   * The price ladder, sent by the server so the page can price a day count
   * without keeping a second copy of the numbers. One source, live preview.
   */
  brackets: PromotionPriceBracket[]
  currency: string
}

/** Mirrors backend `CreatedPromotionPaymentApi` */
export interface CreatedPromotionPayment {
  id: number
  towTruckId: number
  days: number
  amount: number
  currency: string
  status: string
  createdAt: string
  gateway?: { action: string; fields: Record<string, string> }
}
