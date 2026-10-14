/** Mirrors backend `PromotionPriceBracket` — one band of the marginal ladder */
export interface PromotionPriceBracket {
  fromDay: number
  toDay: number
  pricePerDay: number
}

/** Why the block cannot sell anything right now. Mirrors backend `PromotionBlockedReason`. */
export type PromotionBlockedReason = 'inactive' | 'no-subscription'

/**
 * The two placement products. Mirrors the backend's `PromotionScope` enum.
 *
 * - `HOME` — «Իմ քաղաքում վերևում»: the top of the driver's own town page;
 * - `AREA` — «Ամբողջ սպասարկման տարածքում»: HOME, plus first after the local
 *   drivers on every page the driver covers.
 */
export type PromotionScope = 'HOME' | 'AREA'

/** Mirrors backend `PromotionProductApi` */
export interface PromotionProduct {
  activeUntil?: string
  maxDays: number
  brackets: PromotionPriceBracket[]
}

/**
 * Mirrors backend `PromotionStatusApi`. The top-level `activeUntil` /
 * `maxDays` / `brackets` are the HOME product; `area` is the AREA one.
 */
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
  /** «Ամբողջ սպասարկման տարածքում» */
  area: PromotionProduct
}

/** Mirrors backend `CreatedPromotionPaymentApi` */
export interface CreatedPromotionPayment {
  id: number
  towTruckId: number
  days: number
  scope: PromotionScope
  amount: number
  currency: string
  status: string
  createdAt: string
  gateway?: { action: string; fields: Record<string, string> }
}

/** Mirrors backend `PromotionPaymentApi` — one row of the driver's own placement history */
export interface PromotionPayment {
  id: number
  scope: PromotionScope
  days: number
  title: string
  amount: number
  currency: string
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'
  /** ISO datetime */
  createdAt: string
}
