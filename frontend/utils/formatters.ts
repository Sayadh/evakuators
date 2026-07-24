/** 3.5 → "3.5 տ" */
export function formatCapacity(tons: number): string {
  return `${tons} տ`
}

/** 12.4 → "12.4 կմ" */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} կմ`
}

/** ISO datetime → "24 հուլիսի, 14:30" */
export function formatDepartureAt(iso: string): string {
  return new Date(iso).toLocaleString('hy-AM', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
