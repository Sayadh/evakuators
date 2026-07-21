/** 3.5 → "3.5 տ" */
export function formatCapacity(tons: number): string {
  return `${tons} տ`
}

/** 12.4 → "12.4 կմ" */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} կմ`
}
