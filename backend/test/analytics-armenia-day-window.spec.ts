import { describe, expect, it } from 'vitest'
import {
  dateKeyRangeToInstants,
  dateKeyToDate,
  dateKeyToInstant,
  toAnalyticsDateKey,
} from '../src/analytics/analytics.utils'

/**
 * The referral counters on the dashboard overview are the first thing in this
 * module to filter a `DateTime` column by an Armenia calendar range, and that
 * is a different conversion from the one every other reader here does.
 *
 * `AnalyticsDailyStat.statDate` is a `@db.Date`: the value IS the day label,
 * and `dateKeyToDate` spelling it as UTC midnight is exactly right.
 * `DispatchReferral.createdAt` is an instant. A referral logged at 01:00 on
 * the 16th, Armenia time, is `2026-09-15T21:00Z` — so reusing `dateKeyToDate`
 * to bound it would file that job under the 15th and drop it out of the day
 * the operator remembers making it. These tests pin the difference, because
 * the two helpers are one character apart at the call site.
 */
describe('dateKeyToInstant', () => {
  it('is the moment the Armenia day begins, not UTC midnight', () => {
    // Armenia is UTC+4, so the day starts at 20:00Z the evening before.
    expect(dateKeyToInstant('2026-09-16').toISOString()).toBe('2026-09-15T20:00:00.000Z')
  })

  it('differs from dateKeyToDate — which is the whole reason it exists', () => {
    expect(dateKeyToDate('2026-09-16').toISOString()).toBe('2026-09-16T00:00:00.000Z')
    expect(dateKeyToInstant('2026-09-16').getTime()).not.toBe(dateKeyToDate('2026-09-16').getTime())
  })

  it('round-trips: the instant it returns reads back as that same Armenia day', () => {
    for (const key of ['2026-01-01', '2026-06-30', '2026-09-16', '2026-12-31']) {
      expect(toAnalyticsDateKey(dateKeyToInstant(key))).toBe(key)
    }
  })
})

describe('dateKeyRangeToInstants', () => {
  it('covers a single day end to end', () => {
    const range = dateKeyRangeToInstants('2026-09-16', '2026-09-16')

    expect(range.gte.toISOString()).toBe('2026-09-15T20:00:00.000Z')
    // Half-open: `lt` is where the NEXT day starts, so the last millisecond of
    // the 16th is included without anyone having to write 23:59:59.999.
    expect(range.lt.toISOString()).toBe('2026-09-16T20:00:00.000Z')
  })

  it('includes an event at either edge of the Armenia day, and excludes the neighbours', () => {
    const range = dateKeyRangeToInstants('2026-09-16', '2026-09-16')
    const inside = (iso: string): boolean => {
      const at = new Date(iso)
      return at >= range.gte && at < range.lt
    }

    // 00:00 and 23:59 Armenia time on the 16th — both are the 16th.
    expect(inside('2026-09-15T20:00:00.000Z')).toBe(true)
    expect(inside('2026-09-16T19:59:59.999Z')).toBe(true)
    // One millisecond either side belongs to the 15th and the 17th.
    expect(inside('2026-09-15T19:59:59.999Z')).toBe(false)
    expect(inside('2026-09-16T20:00:00.000Z')).toBe(false)
  })

  it('spans a multi-day window inclusively at both ends', () => {
    const range = dateKeyRangeToInstants('2026-09-10', '2026-09-16')

    expect(range.gte.toISOString()).toBe('2026-09-09T20:00:00.000Z')
    expect(range.lt.toISOString()).toBe('2026-09-16T20:00:00.000Z')
  })
})
