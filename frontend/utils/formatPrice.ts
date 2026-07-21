/** 15000 → "15 000 ֏" */
export function formatPrice(amount: number): string {
  return `${new Intl.NumberFormat('hy-AM').format(amount)} ֏`
}

/** 15000 → "սկսած 15 000 ֏" */
export function formatStartingPrice(amount: number): string {
  return `սկսած ${formatPrice(amount)}`
}

/** 300 → "300 ֏/կմ" */
export function formatPricePerKm(amount: number): string {
  return `${formatPrice(amount)}/կմ`
}
