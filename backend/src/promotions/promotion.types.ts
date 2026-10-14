import type { PromotionScope, SubscriptionPaymentStatus } from '@prisma/client'
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
  /**
   * A specialist vehicle (manipulator, heavy-duty). Those never appear on a
   * city or district page — they live on their own landing pages, which a
   * placement does not reorder — so there is nothing to sell them.
   */
  | 'not-listed'

/**
 * One of the two products, as the block needs it: is it running, how much of
 * it is on sale, and at what ladder.
 */
export interface PromotionProductApi {
  /** Set while this product's placement is running */
  activeUntil?: string
  /** Same rule as the top-level `maxDays`, for this product */
  maxDays: number
  brackets: readonly PromotionPriceBracket[]
}

/**
 * The status of both placement products.
 *
 * The top-level `activeUntil` / `maxDays` / `brackets` are «Իմ քաղաքում
 * վերևում» — they were the whole contract before the second product existed,
 * and are kept where they were so a page loaded before a deploy still reads
 * them right. «Ամբողջ սպասարկման տարածքում» is `area`. The refresh allowance
 * and `lastRefreshedAt` are shared: both products queue on the same key.
 */
export interface PromotionStatusApi {
  /** Whether the block may be rendered at all. False only for a deactivated listing. */
  visible: boolean
  blockedReason?: PromotionBlockedReason
  /**
   * Whether «Իմ քաղաքում վերևում» means anything for this driver — false when
   * the base is not a city or Yerevan district (a corridor base), since no page
   * is "theirs". The area product still works on the towns they cover.
   */
  homeAvailable: boolean

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

  /** «Ամբողջ սպասարկման տարածքում» */
  area: PromotionProductApi
}

/** What `POST /my/promotion/payments` answers with — the row, plus the form that pays it */
export interface CreatedPromotionPaymentApi {
  id: number
  towTruckId: number
  days: number
  scope: PromotionScope
  amount: number
  currency: string
  status: string
  createdAt: string
  gateway: unknown
}

/** One row of the driver's own placement history — `GET /my/promotion/payments` */
export interface PromotionPaymentApi {
  id: number
  scope: PromotionScope
  days: number
  /** «Առաջխաղացում · <product> · N օր», the same words the Idram page showed */
  title: string
  amount: number
  currency: string
  status: SubscriptionPaymentStatus
  /** ISO datetime — when the order was placed */
  createdAt: string
}
