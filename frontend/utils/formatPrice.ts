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

/**
 * The dram sign is NOT translated — «֏» is the currency, not a word, and it is
 * what a price tag in Armenia says in any language. Only the words around it
 * change.
 */
const FROM_WORD: Record<string, string> = { hy: 'սկսած', ru: 'от', en: 'from' }
const PER_KM: Record<string, string> = { hy: 'կմ', ru: 'км', en: 'km' }

/** 15000 → "սկսած 15 000 ֏" / "от 15 000 ֏" / "from 15 000 ֏" */
export function formatStartingPrice(amount: number, locale = 'hy'): string {
  return `${FROM_WORD[locale] ?? FROM_WORD.hy} ${formatPrice(amount)}`
}

/** 300 → "300 ֏/կմ" / "300 ֏/км" / "300 ֏/km" */
export function formatPricePerKm(amount: number, locale = 'hy'): string {
  return `${formatPrice(amount)}/${PER_KM[locale] ?? PER_KM.hy}`
}
