import { describe, expect, it } from 'vitest'
import { FEATURED_MAX_DAYS, FEATURED_MIN_DAYS } from '../src/tow-trucks/featured'
import {
  AREA_PROMOTION_PRICE_BRACKETS,
  promotionPrice,
  PROMOTION_PRICE_BRACKETS,
} from '../src/promotions/promotion-pricing'

/**
 * What a placement costs.
 *
 * The properties here matter more than the numbers: the ladder is the sort of
 * thing that gets retuned, and the hole this file exists to prevent is the one
 * the first draft had — "1–5 days at 400 each, 6–10 at 300 each" applied to the
 * whole order makes six days (1,800 ֏) cheaper than five (2,000 ֏). Nobody
 * would buy five, and somebody who wanted four would type six and pay less.
 *
 * So the two invariants are checked across the WHOLE 1–30 range rather than at
 * the boundaries, because a retune is exactly how a boundary gets missed.
 */
const ALL_DAYS = Array.from({ length: FEATURED_MAX_DAYS }, (_, i) => i + 1)

describe('the placement price ladder', () => {
  it('prices the two ends the way they were agreed', () => {
    expect(promotionPrice(1)).toBe(400)
    expect(promotionPrice(30)).toBe(6_000)
  })

  it('prices a partial band by the days it actually reaches', () => {
    // 17 days = all of 1–5 (2,000) + all of 6–10 (1,500) + seven days of 11–20
    // (1,050). The partial band is where an off-by-one would hide.
    expect(promotionPrice(17)).toBe(4_550)
    expect(promotionPrice(5)).toBe(2_000)
    expect(promotionPrice(6)).toBe(2_300)
    expect(promotionPrice(10)).toBe(3_500)
    expect(promotionPrice(20)).toBe(5_000)
  })

  it('never makes more days cheaper than fewer', () => {
    // THE invariant. A ladder that fails this is a ladder nobody buys the top
    // step of.
    for (let days = 2; days <= FEATURED_MAX_DAYS; days += 1) {
      expect(promotionPrice(days)!, `${days} days vs ${days - 1}`).toBeGreaterThan(
        promotionPrice(days - 1)!,
      )
    }
  })

  it('never makes a further day dearer than the one before it', () => {
    // The other half: the average has to fall as the order grows, or the
    // discount is not a discount.
    let previousStep = Number.POSITIVE_INFINITY
    for (let days = 2; days <= FEATURED_MAX_DAYS; days += 1) {
      const step = promotionPrice(days)! - promotionPrice(days - 1)!
      expect(step, `day ${days} costs more than day ${days - 1}`).toBeLessThanOrEqual(previousStep)
      previousStep = step
    }
  })

  it('makes one long order no dearer than the same days bought in pieces', () => {
    // Otherwise the ladder would quietly punish the drivers it is meant to
    // reward, and the cheapest way to buy a month would be thirty single days.
    for (const days of ALL_DAYS) {
      for (let first = 1; first < days; first += 1) {
        expect(promotionPrice(days)!).toBeLessThanOrEqual(
          promotionPrice(first)! + promotionPrice(days - first)!,
        )
      }
    }
  })

  it('refuses a day count that is not on sale', () => {
    // Null rather than an exception: the callers are a bounded DTO and a price
    // preview, and "no price" is a renderable answer where a throw is not.
    expect(promotionPrice(0)).toBeNull()
    expect(promotionPrice(FEATURED_MAX_DAYS + 1)).toBeNull()
    expect(promotionPrice(2.5)).toBeNull()
    expect(promotionPrice(Number.NaN)).toBeNull()
  })

  it('covers every day from the first to the last, exactly once', () => {
    // A gap would price those days at zero; an overlap would charge twice. Both
    // are silent — the total still looks like a number.
    expect(PROMOTION_PRICE_BRACKETS[0]!.fromDay).toBe(FEATURED_MIN_DAYS)
    expect(PROMOTION_PRICE_BRACKETS.at(-1)!.toDay).toBe(FEATURED_MAX_DAYS)

    for (const [index, bracket] of PROMOTION_PRICE_BRACKETS.entries()) {
      expect(bracket.toDay).toBeGreaterThanOrEqual(bracket.fromDay)
      const previous = PROMOTION_PRICE_BRACKETS[index - 1]
      if (previous) expect(bracket.fromDay).toBe(previous.toDay + 1)
    }
  })
})

describe('the «Ամբողջ սպասարկման տարածքում» ladder', () => {
  it('prices the two ends at 2.5× the home product', () => {
    expect(promotionPrice(1, 'AREA')).toBe(1_000)
    expect(promotionPrice(30, 'AREA')).toBe(15_000)
  })

  it('is dearer than the home product for every day count', () => {
    for (const days of ALL_DAYS) {
      expect(promotionPrice(days, 'AREA')!, `${days} days`).toBeGreaterThan(promotionPrice(days)!)
    }
  })

  it('keeps both invariants across the whole range', () => {
    for (let days = 2; days <= FEATURED_MAX_DAYS; days += 1) {
      const total = promotionPrice(days, 'AREA')!
      const previous = promotionPrice(days - 1, 'AREA')!
      expect(total).toBeGreaterThan(previous)
      expect(total / days).toBeLessThanOrEqual(previous / (days - 1))
    }
  })

  it('covers 1–30 with no gap or overlap', () => {
    let next = FEATURED_MIN_DAYS
    for (const bracket of AREA_PROMOTION_PRICE_BRACKETS) {
      expect(bracket.fromDay).toBe(next)
      next = bracket.toDay + 1
    }
    expect(next - 1).toBe(FEATURED_MAX_DAYS)
  })
})
