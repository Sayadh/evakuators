import type { PromotionPriceBracket } from '~/types/promotion'

/**
 * What `days` days cost, from the ladder the SERVER sent.
 *
 * The numbers are never written here. They arrive with the status
 * (`PromotionStatus.brackets`) precisely so this screen cannot drift from what
 * the driver will actually be charged — a second copy of a price list is a
 * second price list, and the one that goes stale is the one on the screen.
 *
 * Marginal bands, like tax bands: each band prices only the days inside it.
 * See the backend's `promotion-pricing.ts` for why — applying one rate to the
 * whole order makes six days cheaper than five.
 */
export function promotionPriceFrom(
  brackets: readonly PromotionPriceBracket[],
  days: number,
): number | null {
  if (!Number.isInteger(days) || days < 1) return null

  let total = 0
  let covered = 0
  for (const bracket of brackets) {
    if (days < bracket.fromDay) break
    const daysInBracket = Math.min(days, bracket.toDay) - bracket.fromDay + 1
    total += daysInBracket * bracket.pricePerDay
    covered = Math.min(days, bracket.toDay)
  }

  // A day count past the last band has no price — the server would refuse it,
  // and showing a total that stops short would be worse than showing none.
  return covered === days ? total : null
}
