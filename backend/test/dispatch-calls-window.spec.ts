import { describe, expect, it } from 'vitest'
import { dateToDateKey } from '../src/analytics/analytics.utils'
import {
  DISPATCH_CALLS_WINDOW_DAYS,
  dispatchCallsWindowStart,
} from '../src/dispatch/dispatch.constants'

/**
 * The «զանգ» figure on a dispatch card counts a rolling window, and this is
 * where its first day is decided.
 *
 * Two things can go wrong and neither shows up as an error: an off-by-one
 * makes the card say 30 days and count 31, and building the cutoff from a raw
 * instant rather than from Armenia's calendar makes the same request answer
 * differently on a UTC server than on one in Yerevan — because `statDate` is
 * a DATE in that calendar.
 */
describe('dispatchCallsWindowStart', () => {
  it('includes today, so thirty days is today and the twenty-nine before it', () => {
    const start = dispatchCallsWindowStart(new Date('2026-10-02T09:00:00.000Z'))
    expect(dateToDateKey(start)).toBe('2026-09-03')
  })

  it('counts exactly the window, never one day more', () => {
    const now = new Date('2026-10-02T09:00:00.000Z')
    const start = dispatchCallsWindowStart(now)
    const days = Math.round((dateKeyMidnight('2026-10-02') - start.getTime()) / 86_400_000) + 1
    expect(days).toBe(DISPATCH_CALLS_WINDOW_DAYS)
  })

  it('lands on the same calendar day whatever hour of it is asked', () => {
    // A raw `now - 30 * DAY` would give two different answers here, and the
    // card would show two different numbers depending on when it was opened.
    const early = dispatchCallsWindowStart(new Date('2026-10-02T00:30:00.000Z'))
    const late = dispatchCallsWindowStart(new Date('2026-10-02T19:45:00.000Z'))
    expect(dateToDateKey(early)).toBe(dateToDateKey(late))
  })

  it('crosses a month boundary by the calendar, not by arithmetic on 30', () => {
    // March back over February: a fixed «minus 30 days» is right only because
    // it is applied to date keys rather than to month lengths.
    const start = dispatchCallsWindowStart(new Date('2026-03-05T12:00:00.000Z'))
    expect(dateToDateKey(start)).toBe('2026-02-04')
  })
})

/** Midnight UTC of a `YYYY-MM-DD` key, for the day arithmetic above */
function dateKeyMidnight(key: string): number {
  return new Date(`${key}T00:00:00.000Z`).getTime()
}
