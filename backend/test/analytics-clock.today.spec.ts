import { describe, expect, it } from 'vitest'
import { AnalyticsClock } from '../src/analytics/analytics-clock.service'
import { AnalyticsPeriod } from '../src/analytics/analytics.enums'

/**
 * `AnalyticsPeriod.Today` — added for the admin's site-wide panel — must
 * resolve to a genuine 1-day window (today only), not "the last 24 hours" and
 * not accidentally 0 or 2 days from an off-by-one in `ANALYTICS_PERIOD_DAYS`.
 *
 * Subclassed rather than mocking `Date`, same technique any other
 * `AnalyticsClock` test in this module would use: `now()` is the one
 * overridable seam (see the class's own comment).
 */
class FixedClock extends AnalyticsClock {
  constructor(private readonly fixed: Date) {
    super()
  }

  protected override now(): Date {
    return this.fixed
  }
}

describe('AnalyticsClock.resolveRange(Today)', () => {
  it('is a single day: from equals to equals today', () => {
    const clock = new FixedClock(new Date('2026-03-15T10:00:00Z'))
    const range = clock.resolveRange(AnalyticsPeriod.Today)

    expect(range.from).toBe('2026-03-15')
    expect(range.to).toBe('2026-03-15')
    expect(range.days).toBe(1)
  })

  it('never reaches into yesterday, unlike every other period', () => {
    const clock = new FixedClock(new Date('2026-03-15T10:00:00Z'))

    expect(clock.resolveRange(AnalyticsPeriod.Today).from).not.toBe(
      clock.resolveRange(AnalyticsPeriod.Last7Days).from,
    )
  })
})
