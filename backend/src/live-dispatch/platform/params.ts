import type { SqlParam } from './sql'

/**
 * Numbers placeholders as values are added, so a query never has a `$7` that
 * silently points at the wrong value after someone inserts a parameter in the
 * middle. `p.add(x)` returns `$n`.
 */
export class Params {
  readonly values: SqlParam[] = []

  add(value: SqlParam): string {
    this.values.push(value === undefined ? null : value)
    return `$${this.values.length}`
  }
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') return Number(value)
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber()
  }
  return Number(value)
}

export function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value)
}

export function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}

export function toNullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value)
}
