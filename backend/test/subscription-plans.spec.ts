import { describe, expect, it } from 'vitest'
import {
  findSubscriptionPlan,
  SUBSCRIPTION_PLAN_CODES,
  SUBSCRIPTION_PLANS,
} from '../src/subscriptions/subscription-plans'

/**
 * The plans are the price list, and this file is what makes changing a price
 * a deliberate act rather than a typo. They are constants and not a table for
 * the reasons argued in `subscription-plans.ts`; the cost of that choice is
 * that nothing but a test pins their values, so this pins them.
 */
describe('SUBSCRIPTION_PLANS', () => {
  it('offers exactly the two plans that are sold', () => {
    expect(SUBSCRIPTION_PLAN_CODES).toEqual(['ONE_MONTH', 'FOUR_MONTHS'])
  })

  it('prices 1 month at 3000 ֏', () => {
    const plan = findSubscriptionPlan('ONE_MONTH')
    expect(plan).toMatchObject({ price: 3000, durationMonths: 1, currency: 'AMD' })
  })

  it('prices 4 months at 10000 ֏', () => {
    const plan = findSubscriptionPlan('FOUR_MONTHS')
    expect(plan).toMatchObject({ price: 10000, durationMonths: 4, currency: 'AMD' })
  })

  it('returns undefined for a code that is not on sale', () => {
    // A retired plan read back off an old payment row lands here — it must be
    // a miss, not a throw (see toSubscriptionPaymentApi's title fallback).
    expect(findSubscriptionPlan('TWELVE_MONTHS')).toBeUndefined()
    expect(findSubscriptionPlan('')).toBeUndefined()
  })

  it('gives every plan Armenian, driver-facing text', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(plan.title).toMatch(/[԰-֏]/)
      expect(plan.description).toMatch(/[԰-֏]/)
    }
  })

  it('is frozen, so no request handler can edit the price list at runtime', () => {
    expect(Object.isFrozen(SUBSCRIPTION_PLANS)).toBe(true)
    expect(Object.isFrozen(SUBSCRIPTION_PLANS[0])).toBe(true)
  })
})
