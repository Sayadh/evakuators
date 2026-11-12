/**
 * The driver's fee for an order (product decision 2026-11-12), as a pure
 * function of the price and the schedule in DispatchSettings:
 *
 *   price ≤ 5 000 ֏ (minimum)   → 0 ֏      (a negotiated order agreed at it gets its 1000 back after review)
 *   price ≤ 15 000 ֏            → 1 000 ֏  (also: no price known yet)
 *   above                       → 7% of the WHOLE price, rounded to 100 ֏,
 *                                  never below 1 000 ֏, never above 6 000 ֏
 *
 *   20 000 → 1 400 · 30 000 → 2 100 · 50 000 → 3 500 · 85 800+ → 6 000
 *
 * WHEN it is charged is wallet-ledger.ts: at accept (the order's price if it
 * has one, else the base fee), settled to the final price when the price is
 * agreed and at completion, refunded when an operator cancels or takes the
 * order away before the driver arrived.
 */
import type { DispatchSettings } from '../../platform/settings'

/**
 * The schedule, as copied onto every ORDER_FEE line (settlements use the
 * terms the driver accepted under). The step fields belong to the first
 * schedule (+1000 per started 10 000 ֏) — only lines written under it carry them.
 */
export type FeeRules = Pick<DispatchSettings, 'walletFeeBaseAmd' | 'walletFeeBaseMaxPriceAmd'> &
  Partial<Pick<DispatchSettings, 'walletFeeFreeMaxPriceAmd' | 'walletFeePercent' | 'walletFeeRoundAmd' | 'walletFeeMaxAmd'>> & {
    walletFeeStepPriceAmd?: number
    walletFeeStepAmd?: number
  }

export function feeRulesOf(settings: DispatchSettings): FeeRules {
  return {
    walletFeeFreeMaxPriceAmd: settings.walletFeeFreeMaxPriceAmd,
    walletFeeBaseAmd: settings.walletFeeBaseAmd,
    walletFeeBaseMaxPriceAmd: settings.walletFeeBaseMaxPriceAmd,
    walletFeePercent: settings.walletFeePercent,
    walletFeeRoundAmd: settings.walletFeeRoundAmd,
    walletFeeMaxAmd: settings.walletFeeMaxAmd,
  }
}

/** The fee for an order of this price; `null` (not agreed yet) → the base fee */
export function orderFeeAmd(priceAmd: number | null, rules: FeeRules): number {
  if (priceAmd !== null && priceAmd <= (rules.walletFeeFreeMaxPriceAmd ?? 0)) return 0
  if (priceAmd === null || priceAmd <= rules.walletFeeBaseMaxPriceAmd) return rules.walletFeeBaseAmd
  if (rules.walletFeePercent === undefined) {
    // The first schedule, kept for lines accepted under it
    const steps = Math.ceil((priceAmd - rules.walletFeeBaseMaxPriceAmd) / (rules.walletFeeStepPriceAmd ?? 10_000))
    return rules.walletFeeBaseAmd + steps * (rules.walletFeeStepAmd ?? 1000)
  }
  const round = Math.max(1, rules.walletFeeRoundAmd ?? 1)
  const raw = Math.round((priceAmd * rules.walletFeePercent) / 100 / round) * round
  const atLeastBase = Math.max(rules.walletFeeBaseAmd, raw)
  return rules.walletFeeMaxAmd && rules.walletFeeMaxAmd > 0 ? Math.min(rules.walletFeeMaxAmd, atLeastBase) : atLeastBase
}

/** The price the fee is computed from: agreed if there is one, else a fixed quote, else none yet */
export function feePrice(order: { pricingMode: string; quotedPriceAmd: number | null; agreedPriceAmd: number | null }): number | null {
  if (order.agreedPriceAmd !== null) return order.agreedPriceAmd
  return order.pricingMode === 'FIXED' ? order.quotedPriceAmd : null
}

/** Is billing on, and how much must a driver hold to be offered this order? `null` = no wallet check */
export function requiredBalanceFor(
  order: { pricingMode: string; quotedPriceAmd: number | null; agreedPriceAmd: number | null },
  settings: DispatchSettings,
): number | null {
  if (settings.walletBillingEnabled !== 1) return null
  const fee = orderFeeAmd(feePrice(order), feeRulesOf(settings))
  // A free order (the minimum price) needs no balance at all
  return fee > 0 ? fee : null
}

/** What accepting this order costs now (0 = free); null while billing is off */
export function feeForOffer(
  order: { pricingMode: string; quotedPriceAmd: number | null; agreedPriceAmd: number | null },
  settings: DispatchSettings,
): number | null {
  if (settings.walletBillingEnabled !== 1) return null
  return orderFeeAmd(feePrice(order), feeRulesOf(settings))
}

/** A top-up amount the driver may ask for: whole drams within the configured bounds */
export function validTopupAmount(amount: unknown, settings: DispatchSettings): amount is number {
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= settings.walletMinTopupAmd && amount <= settings.walletMaxTopupAmd
}

/**
 * The bonus a top-up earns (2026-11-12): the highest threshold it reaches
 * decides the percent; whole drams, rounded down. 0 when bonuses are off.
 */
export function topupBonusAmd(amountAmd: number, settings: Pick<DispatchSettings, 'walletTopupBonusEnabled' | 'walletTopupBonusThresholdsAmd' | 'walletTopupBonusPercents'>): number {
  if (settings.walletTopupBonusEnabled !== 1) return 0
  let percent = 0
  settings.walletTopupBonusThresholdsAmd.forEach((threshold, i) => {
    if (amountAmd >= threshold) percent = settings.walletTopupBonusPercents[i] ?? 0
  })
  return Math.floor((amountAmd * percent) / 100)
}

/** The free (minimum) price for an order of this road length — refused above the configured distance */
export function freePriceAllowed(routeMeters: number | null, settings: Pick<DispatchSettings, 'walletFreeMaxRouteMeters'>): boolean {
  if (settings.walletFreeMaxRouteMeters <= 0 || routeMeters === null) return true
  return routeMeters <= settings.walletFreeMaxRouteMeters
}

/** Is this price in the free band (and therefore, for a driver-entered price, to be reviewed)? */
export function isFreePrice(priceAmd: number, settings: Pick<DispatchSettings, 'walletFeeFreeMaxPriceAmd'>): boolean {
  return settings.walletFeeFreeMaxPriceAmd > 0 && priceAmd <= settings.walletFeeFreeMaxPriceAmd
}
