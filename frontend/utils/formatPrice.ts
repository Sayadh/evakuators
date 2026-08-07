import { formatCount } from './formatters'

/**
 * Prices are grouped by `formatCount`, not by `Intl.NumberFormat('hy-AM')`.
 *
 * The `Intl` version was a hydration mismatch on every page that shows a price
 * — which includes the homepage, since `TowTruckCard` renders there. A runtime
 * without the requested locale falls back to its own default, and the default
 * disagrees about the separator:
 *
 *   hy-AM / ru-RU → "15 000"      en-US → "15,000"      de-DE → "15.000"
 *
 * So the server sent one string and a visitor whose browser was set to English
 * or Russian re-rendered a different one. Same root cause, and same fix, as the
 * dates — see the comment block in `formatters.ts`.
 */

/** 15000 → "15 000 ֏" */
export function formatPrice(amount: number): string {
  return `${formatCount(amount)} ֏`
}

/** 15000 → "սկսած 15 000 ֏" */
export function formatStartingPrice(amount: number): string {
  return `սկսած ${formatPrice(amount)}`
}

/** 300 → "300 ֏/կմ" */
export function formatPricePerKm(amount: number): string {
  return `${formatPrice(amount)}/կմ`
}
