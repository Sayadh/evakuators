/** 3.5 → "3.5 տ" */
export function formatCapacity(tons: number): string {
  return `${tons} տ`
}

/** 12.4 → "12.4 կմ" */
export function formatDistance(km: number): string {
  return `${km.toFixed(1)} կմ`
}

/**
 * Analytics date keys are plain `YYYY-MM-DD` strings, not instants — they
 * already denote an Armenia calendar day (resolved by the backend). Both
 * formatters below build the Date in UTC and format it in UTC so the label can
 * never shift by a day depending on the reader's own timezone.
 */
function dateKeyToUtcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

/** '2026-07-27' → "27.07" — compact chart axis label */
export function formatDateKeyShort(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  return `${day}.${month}`
}

/** '2026-07-27' → "27 հուլիսի" */
export function formatDateKeyLong(dateKey: string): string {
  return dateKeyToUtcDate(dateKey).toLocaleDateString('hy-AM', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** 12345 → "12 345" — thin-spaced thousands, readable at a glance on a card */
export function formatCount(value: number): string {
  return value.toLocaleString('hy-AM')
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
