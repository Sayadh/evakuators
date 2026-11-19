import { describe, expect, it } from 'vitest'
import { PRICE_GUIDE } from '~/constants/priceGuide'
import { buildYerevanFaq } from '~/utils/faqContent'
import { formatPriceRange } from '~/utils/formatPrice'
import { buildYerevanListingDescription, summarizeYerevanListing } from '~/utils/seoContent'

const NBSP = ' '
const LOCALES = ['hy', 'ru', 'en']

const trucks = [
  { startingPrice: 7000, works24Hours: true },
  { startingPrice: 5000, works24Hours: true },
  { startingPrice: null, works24Hours: false },
  { startingPrice: 0, works24Hours: true },
]

describe('summarizeYerevanListing', () => {
  it('counts drivers, 24/7 drivers and the lowest real price', () => {
    expect(summarizeYerevanListing(trucks)).toEqual({ count: 4, lowestPrice: 5000, works24: 3 })
  })

  it('has no price when nobody listed one', () => {
    expect(summarizeYerevanListing([{ startingPrice: null, works24Hours: false }]).lowestPrice).toBeNull()
  })
})

describe('buildYerevanListingDescription', () => {
  const stats = summarizeYerevanListing(trucks)

  it('leads the Russian description with the phrasing people search', () => {
    expect(buildYerevanListingDescription(stats, 'ru')).toBe(
      `Вызвать эвакуатор в Ереване круглосуточно: 4 водителя во всех 12 районах, цены от 5${NBSP}000 ֏. Реальные фото и цены — звоните водителю напрямую.`,
    )
  })

  it.each(LOCALES)('stays a usable snippet length in %s', (locale) => {
    const text = buildYerevanListingDescription({ count: 143, lowestPrice: 3000, works24: 120 }, locale)
    expect(text?.length).toBeLessThanOrEqual(165)
  })

  it('drops only the price when no driver listed one', () => {
    const text = buildYerevanListingDescription({ count: 2, lowestPrice: null, works24: 0 }, 'en')
    expect(text).toBe('Call a tow truck in Yerevan 24/7: 2 drivers across all 12 districts. Real photos and prices — call the driver directly.')
  })

  it('returns null without drivers, so the page keeps its regular description', () => {
    expect(buildYerevanListingDescription({ count: 0, lowestPrice: null, works24: 0 }, 'hy')).toBeNull()
  })
})

describe('buildYerevanFaq', () => {
  const typical = formatPriceRange(PRICE_GUIDE.cityCallout.low, PRICE_GUIDE.cityCallout.high)

  it.each(LOCALES)('has five answers quoting the /gner range in %s', (locale) => {
    const faq = buildYerevanFaq(summarizeYerevanListing(trucks), locale)
    expect(faq).toHaveLength(5)
    expect(faq[0]?.answer).toContain(typical)
  })

  it.each([
    [1, 'у 1 водителя'],
    [21, 'у 21 водителя'],
    [11, 'у 11 водителей'],
    [37, 'у 37 водителей'],
  ])('declines the Russian 24/7 count for %i', (works24, expected) => {
    const faq = buildYerevanFaq({ count: 43, lowestPrice: 5000, works24 }, 'ru')
    expect(faq[1]?.answer).toContain(expected)
  })

  it.each(LOCALES)('answers without numbers when the listing failed in %s', (locale) => {
    const text = JSON.stringify(buildYerevanFaq({ count: 0, lowestPrice: null, works24: 0 }, locale))
    expect(text).not.toMatch(/\b0 (վարորդ|водител|driver)/)
    expect(text).not.toContain('undefined')
  })
})
