import { PromotionScope } from '@prisma/client'
import { FEATURED_MAX_DAYS, FEATURED_MIN_DAYS } from '../tow-trucks/featured'

/**
 * What a placement costs, and the only place that decides it.
 *
 * ## Why a ladder and not a per-day price
 *
 * A flat rate makes one day and thirty days the same offer at different sizes.
 * The ladder says what the product actually is: a day at the top is a burst,
 * bought on the morning somebody wants work, and a month is a standing
 * position. So the first days are priced like the burst and the last like the
 * standing position — 400 ֏ on day one, an average of 200 ֏ across thirty.
 *
 * ## Why the brackets are MARGINAL, like tax bands
 *
 * The obvious shape — "1–5 days cost 400 each, 6–10 cost 300 each" applied to
 * the whole order — has a hole in it: five days would be 2,000 ֏ and six would
 * be 1,800 ֏. Nobody would ever buy five, and somebody who wanted four would
 * type six and pay less. Marginal bands cannot do that: every further day adds
 * its own band's price, so the total only ever rises, while the average only
 * ever falls.
 *
 * Both properties are asserted in `promotion-pricing.spec.ts` across the whole
 * 1–30 range rather than at the boundaries, because a future edit to these
 * numbers is exactly how the hole would come back.
 *
 * ## Why the client never sends an amount
 *
 * Same rule as `subscription-plans.ts`: the request carries a number of DAYS,
 * and the server prices it. The payment form lives in the driver's own
 * browser, so a client that could state its own price would be stating it.
 */
export interface PromotionPriceBracket {
  /** First day of the band, 1-based and inclusive */
  fromDay: number
  /** Last day of the band, inclusive. The final band ends at FEATURED_MAX_DAYS */
  toDay: number
  /** Whole drams per day INSIDE this band — see the note on marginal pricing */
  pricePerDay: number
}

export const PROMOTION_PRICE_BRACKETS: readonly PromotionPriceBracket[] = Object.freeze([
  Object.freeze({ fromDay: 1, toDay: 5, pricePerDay: 400 }),
  Object.freeze({ fromDay: 6, toDay: 10, pricePerDay: 300 }),
  Object.freeze({ fromDay: 11, toDay: 20, pricePerDay: 150 }),
  Object.freeze({ fromDay: 21, toDay: 30, pricePerDay: 100 }),
] as PromotionPriceBracket[])

/**
 * «Ամբողջ սպասարկման տարածքում» — 700 ֏ on day one, 11,000 ֏ for thirty.
 *
 * The same four bands as the home ladder, so the two products keep the same
 * reading — a burst is dearer per day than a standing position — and only the
 * reach differs. Deliberately NOT a big multiple of the home price: outside
 * their own town the driver is placed after the local drivers, not above them,
 * so what is sold is the first place among visitors on up to five more pages,
 * and 5,000 ֏ a month over the home product is what that is worth. Every total
 * is a round number.
 */
export const AREA_PROMOTION_PRICE_BRACKETS: readonly PromotionPriceBracket[] = Object.freeze([
  Object.freeze({ fromDay: 1, toDay: 5, pricePerDay: 700 }),
  Object.freeze({ fromDay: 6, toDay: 10, pricePerDay: 500 }),
  Object.freeze({ fromDay: 11, toDay: 20, pricePerDay: 300 }),
  Object.freeze({ fromDay: 21, toDay: 30, pricePerDay: 200 }),
] as PromotionPriceBracket[])

/** The ladder for one product */
export function promotionBrackets(scope: PromotionScope): readonly PromotionPriceBracket[] {
  return scope === PromotionScope.AREA ? AREA_PROMOTION_PRICE_BRACKETS : PROMOTION_PRICE_BRACKETS
}

/** AMD, like every other price in this project. See `SubscriptionPlan.price`. */
export const PROMOTION_CURRENCY = 'AMD'

/**
 * How many times a day a driver may refresh their placement back to the top.
 *
 * The refresh is what makes a crowded town fair: the order inside the promoted
 * block is "who refreshed last", so everyone who paid gets the top some of the
 * time instead of the earliest buyer keeping it. Unlimited refreshing would
 * hand the top to whoever sits on the button all day and quietly recreate the
 * thing this replaced.
 *
 * Six per Armenia calendar day, not a cooldown between presses. A driver who
 * spends all six before lunch has only spent their own: a refresh matters until
 * the next driver refreshes, so hoarding them in one hour is self-defeating,
 * and a cooldown would be a second rule to explain for no further fairness.
 */
export const PROMOTION_BUMPS_PER_DAY = 6

/**
 * Whole drams for `days` days of placement.
 *
 * Returns `null` rather than throwing for a day count outside 1–30: callers
 * reach this from a DTO that has already bounded the value, and from a price
 * preview where "no price" is a renderable answer and an exception is not.
 */
export function promotionPrice(
  days: number,
  scope: PromotionScope = PromotionScope.HOME,
): number | null {
  if (!Number.isInteger(days) || days < FEATURED_MIN_DAYS || days > FEATURED_MAX_DAYS) {
    return null
  }

  let total = 0
  for (const bracket of promotionBrackets(scope)) {
    if (days < bracket.fromDay) break
    // The part of this band the order actually reaches. `Math.min` is what
    // makes the last band partial — 17 days takes all of 1–5 and 6–10, and
    // seven of the ten days in 11–20.
    const daysInBracket = Math.min(days, bracket.toDay) - bracket.fromDay + 1
    total += daysInBracket * bracket.pricePerDay
  }

  return total
}
