import { describe, expect, it } from 'vitest'
import {
  featuredUntilFrom,
  isFeaturedNow,
  isValidFeaturedDays,
  FEATURED_MAX_DAYS,
  FEATURED_MIN_DAYS,
} from '../src/tow-trucks/featured'

const NOW = new Date('2026-09-09T12:00:00.000Z')

describe('isFeaturedNow', () => {
  it('is false for a driver who was never featured', () => {
    expect(isFeaturedNow({ isFeatured: false, featuredUntil: null }, NOW)).toBe(false)
  })

  it('is true inside the window', () => {
    const until = new Date('2026-09-10T12:00:00.000Z')
    expect(isFeaturedNow({ isFeatured: true, featuredUntil: until }, NOW)).toBe(true)
  })

  it('is false once the window has closed, even while the flag is still true', () => {
    // The whole reason this function exists. The sweep runs hourly, so this
    // state is normal for up to an hour — and during it the driver must not be
    // occupying a paid slot above drivers who did pay.
    const until = new Date('2026-09-09T11:59:59.000Z')
    expect(isFeaturedNow({ isFeatured: true, featuredUntil: until }, NOW)).toBe(false)
  })

  it('is false exactly at the boundary', () => {
    expect(isFeaturedNow({ isFeatured: true, featuredUntil: NOW }, NOW)).toBe(false)
  })

  it('treats no end date as open-ended, not as expired', () => {
    // Every placement granted before durations existed looks like this.
    // Reading it as "over" would have cleared the editorial homepage picks on
    // the deploy that introduced the window.
    expect(isFeaturedNow({ isFeatured: true, featuredUntil: null }, NOW)).toBe(true)
  })
})

describe('featuredUntilFrom', () => {
  it('counts whole days from the moment of purchase', () => {
    // Not from midnight: bought at 18:00, one day has to be worth an evening
    // and a morning, or the product sells six hours as a day.
    expect(featuredUntilFrom(new Date('2026-09-09T18:00:00.000Z'), 1).toISOString()).toBe(
      '2026-09-10T18:00:00.000Z',
    )
  })

  it('handles the longest placement the product sells', () => {
    expect(featuredUntilFrom(NOW, FEATURED_MAX_DAYS).toISOString()).toBe(
      '2026-10-09T12:00:00.000Z',
    )
  })

  it('produces a window that is live immediately and dead after it', () => {
    const until = featuredUntilFrom(NOW, 3)
    expect(isFeaturedNow({ isFeatured: true, featuredUntil: until }, NOW)).toBe(true)
    expect(
      isFeaturedNow({ isFeatured: true, featuredUntil: until }, new Date(until.getTime() + 1)),
    ).toBe(false)
  })
})

describe('isValidFeaturedDays', () => {
  it('accepts the range the product sells', () => {
    expect(isValidFeaturedDays(FEATURED_MIN_DAYS)).toBe(true)
    expect(isValidFeaturedDays(FEATURED_MAX_DAYS)).toBe(true)
    expect(isValidFeaturedDays(7)).toBe(true)
  })

  it('refuses zero, negatives and anything past the cap', () => {
    expect(isValidFeaturedDays(0)).toBe(false)
    expect(isValidFeaturedDays(-3)).toBe(false)
    expect(isValidFeaturedDays(FEATURED_MAX_DAYS + 1)).toBe(false)
  })

  it('refuses a fraction of a day', () => {
    // A half-day placement has no price and no meaning; it would only ever
    // arrive from a caller doing arithmetic it should not be doing.
    expect(isValidFeaturedDays(1.5)).toBe(false)
  })
})
