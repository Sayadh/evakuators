import { describe, expect, it } from 'vitest'
import { addMonths, renewalPeriod, subscriptionPeriod } from '../src/subscriptions/subscription-period'

/** ISO in, ISO out — reads as the dates a person would check on a receipt */
function plus(startIso: string, months: number): string {
  return addMonths(new Date(startIso), months).toISOString()
}

describe('addMonths', () => {
  it('adds a whole month in the ordinary case', () => {
    expect(plus('2026-09-02T10:00:00.000Z', 1)).toBe('2026-10-02T10:00:00.000Z')
  })

  it('adds four months for the longer plan', () => {
    expect(plus('2026-09-02T10:00:00.000Z', 4)).toBe('2027-01-02T10:00:00.000Z')
  })

  it('rolls the year over', () => {
    expect(plus('2026-12-15T08:30:00.000Z', 1)).toBe('2027-01-15T08:30:00.000Z')
  })

  it('clamps to the end of a shorter month instead of overflowing into the next one', () => {
    // JavaScript's own answer here is 3 March — Date normalises "31 February"
    // forward. Left alone that silently sells two or three extra days on every
    // 31st, so this is the case the whole function exists for.
    expect(plus('2026-01-31T09:00:00.000Z', 1)).toBe('2026-02-28T09:00:00.000Z')
  })

  it('clamps to 29 February in a leap year', () => {
    expect(plus('2028-01-31T09:00:00.000Z', 1)).toBe('2028-02-29T09:00:00.000Z')
  })

  it('clamps a 31st to a 30-day month', () => {
    expect(plus('2026-08-31T09:00:00.000Z', 1)).toBe('2026-09-30T09:00:00.000Z')
  })

  it('keeps the time of day exactly', () => {
    expect(plus('2026-09-02T23:59:59.999Z', 1)).toBe('2026-10-02T23:59:59.999Z')
  })

  it('does not mutate the date it was given', () => {
    const start = new Date('2026-09-02T10:00:00.000Z')
    addMonths(start, 4)
    expect(start.toISOString()).toBe('2026-09-02T10:00:00.000Z')
  })
})

describe('subscriptionPeriod', () => {
  it('starts at the instant it was handed, not at some rounded boundary', () => {
    const now = new Date('2026-09-02T16:20:31.000Z')
    expect(subscriptionPeriod(now, 1).start).toBe(now)
  })

  it('ends durationMonths later', () => {
    const now = new Date('2026-09-02T16:20:31.000Z')
    expect(subscriptionPeriod(now, 4).end.toISOString()).toBe('2027-01-02T16:20:31.000Z')
  })
})

describe('renewalPeriod', () => {
  const paidAt = new Date('2026-09-02T10:00:00.000Z')

  it('starts at the payment date for a driver with no coverage', () => {
    const period = renewalPeriod(null, paidAt, 1)
    expect(period.start.toISOString()).toBe('2026-09-02T10:00:00.000Z')
    expect(period.end.toISOString()).toBe('2026-10-02T10:00:00.000Z')
  })

  it('starts at the payment date once the old coverage has already lapsed', () => {
    const lapsed = new Date('2026-07-01T10:00:00.000Z')
    expect(renewalPeriod(lapsed, paidAt, 1).start.toISOString()).toBe('2026-09-02T10:00:00.000Z')
  })

  it('extends from the end of live coverage instead of restarting it', () => {
    // The property that makes renewing early safe: a driver with three weeks
    // left who buys another month ends up with three weeks PLUS a month.
    const stillCovered = new Date('2026-09-23T10:00:00.000Z')
    const period = renewalPeriod(stillCovered, paidAt, 1)
    expect(period.start.toISOString()).toBe('2026-09-23T10:00:00.000Z')
    expect(period.end.toISOString()).toBe('2026-10-23T10:00:00.000Z')
  })

  it('stacks a 4-month plan onto live coverage', () => {
    const stillCovered = new Date('2026-09-23T10:00:00.000Z')
    expect(renewalPeriod(stillCovered, paidAt, 4).end.toISOString()).toBe('2027-01-23T10:00:00.000Z')
  })
})
