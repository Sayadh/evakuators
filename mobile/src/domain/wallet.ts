/**
 * The driver wallet, as the app explains it (2026-11-12). Pure, unit-tested.
 * The server decides every charge (backend wallet/domain/fees.ts); this is
 * only the same schedule rendered as a table the driver can read, and the
 * bits of arithmetic the screen needs.
 */
import type { WalletEntryKind, WalletFees } from '../api/types'

/** Same rule as the server (backend wallet/domain/fees.ts) */
export function feeFor(priceAmd: number | null, fees: WalletFees): number {
  if (priceAmd !== null && priceAmd <= (fees.freeMaxPriceAmd ?? 0)) return 0
  if (priceAmd === null || priceAmd <= fees.baseMaxPriceAmd) return fees.baseAmd
  const round = Math.max(1, fees.roundAmd)
  const fee = Math.max(fees.baseAmd, Math.round((priceAmd * fees.percent) / 100 / round) * round)
  return fees.maxAmd > 0 ? Math.min(fees.maxAmd, fee) : fee
}

export interface FeeBand {
  /** Inclusive lower bound of the order price; 0 for the first band */
  fromAmd: number
  /** Inclusive upper bound */
  toAmd: number
  feeAmd: number
}

/** The fixed bands: free, then the base fee — «մինչև 5 000 ֏ → 0, 5 001–15 000 ֏ → 1 000 ֏» */
export function feeBands(fees: WalletFees): FeeBand[] {
  const free = fees.freeMaxPriceAmd ?? 0
  const bands: FeeBand[] = free > 0 ? [{ fromAmd: 0, toAmd: free, feeAmd: 0 }] : []
  bands.push({ fromAmd: free > 0 ? free + 1 : 0, toAmd: fees.baseMaxPriceAmd, feeAmd: fees.baseAmd })
  return bands
}

/** A few worked examples above the base band, for the «how it is worked out» card */
export function feeExamples(fees: WalletFees, prices = [20000, 30000, 50000]): { priceAmd: number; feeAmd: number }[] {
  return prices.filter((p) => p > fees.baseMaxPriceAmd).map((priceAmd) => ({ priceAmd, feeAmd: feeFor(priceAmd, fees) }))
}

/** Quick amounts to top up by, kept inside the server's bounds */
export function topupPresets(bounds: { minAmd: number; maxAmd: number }): number[] {
  return [2000, 5000, 10000, 20000].filter((amount) => amount >= bounds.minAmd && amount <= bounds.maxAmd)
}

/** A typed amount → whole drams within bounds, or the reason it is not */
export function parseTopupAmount(text: string, bounds: { minAmd: number; maxAmd: number }): { ok: true; amountAmd: number } | { ok: false; reason: 'EMPTY' | 'NOT_A_NUMBER' | 'TOO_SMALL' | 'TOO_LARGE' } {
  const digits = text.replace(/[\s,]/g, '')
  if (!digits) return { ok: false, reason: 'EMPTY' }
  if (!/^\d+$/.test(digits)) return { ok: false, reason: 'NOT_A_NUMBER' }
  const amountAmd = Number(digits)
  if (amountAmd < bounds.minAmd) return { ok: false, reason: 'TOO_SMALL' }
  if (amountAmd > bounds.maxAmd) return { ok: false, reason: 'TOO_LARGE' }
  return { ok: true, amountAmd }
}

/** How many orders of the base fee this balance still covers (the "≈ N orders" hint) */
export function ordersCovered(balanceAmd: number, fees: WalletFees): number {
  return fees.baseAmd > 0 && balanceAmd > 0 ? Math.floor(balanceAmd / fees.baseAmd) : 0
}

/** The bonus a top-up of this amount earns — the same rule as the server */
export function bonusFor(amountAmd: number, tiers: { fromAmd: number; percent: number }[] = []): number {
  let percent = 0
  for (const tier of tiers) if (amountAmd >= tier.fromAmd) percent = tier.percent
  return Math.floor((amountAmd * percent) / 100)
}

export const ENTRY_ICON: Record<WalletEntryKind, 'plus' | 'truck' | 'refresh' | 'wallet' | 'star'> = {
  TOPUP: 'plus',
  TOPUP_BONUS: 'star',
  ORDER_FEE: 'truck',
  ORDER_FEE_ADJUSTMENT: 'truck',
  ORDER_FEE_REFUND: 'refresh',
  ADMIN_CREDIT: 'wallet',
  ADMIN_DEBIT: 'wallet',
}
