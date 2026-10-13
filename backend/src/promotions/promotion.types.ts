import type { PromotionPriceBracket } from './promotion-pricing'

/**
 * Why the promotion block is not usable right now.
 *
 * `undefined` on a driver who can buy. The two reasons are different enough to
 * need different screens: one is a dead end until an admin acts, the other is a
 * sentence and a link to the thing that fixes it.
 */
export type PromotionBlockedReason =
  /** The listing is deactivated. The block is not shown at all — see the service. */
  | 'inactive'
  /** No live subscription. Shown, explained, and nothing is for sale. */
  | 'no-subscription'

export interface PromotionStatusApi {
  /** Whether the block may be rendered at all. False only for a deactivated listing. */
  visible: boolean
  blockedReason?: PromotionBlockedReason

  /** Set while a paid placement is running */
  activeUntil?: string
  /** When the driver last refreshed — what the town page orders the promoted block by */
  lastRefreshedAt?: string

  /** Refreshes left today, out of `refreshesPerDay`. Zero when nothing is running. */
  refreshesLeft: number
  refreshesPerDay: number

  /**
   * The largest order this driver may place right now.
   *
   * Bounded by the subscription: a placement may not outlive the access it
   * decorates. Zero means "nothing to sell today" — either there is no live
   * subscription, or the placement already runs to the end of it.
   */
  maxDays: number
  /** The ladder, so the page can price a day count without a second copy of it */
  brackets: readonly PromotionPriceBracket[]
  currency: string
}

/** What `POST /my/promotion/payments` answers with — the row, plus the form that pays it */
export interface CreatedPromotionPaymentApi {
  id: number
  towTruckId: number
  days: number
  amount: number
  currency: string
  status: string
  createdAt: string
  gateway: unknown
}
