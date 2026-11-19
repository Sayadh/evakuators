import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOOTER_PAGES } from '~/constants/navigation'
import { PRICE_GUIDE } from '~/constants/priceGuide'
import { buildPriceGuide } from '~/utils/priceGuideContent'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LOCALES = ['hy', 'ru', 'en']

describe('price guide figures', () => {
  it.each(Object.entries(PRICE_GUIDE))('%s has an ordered range', (_key, figure) => {
    expect(figure.low).toBeLessThanOrEqual(figure.median)
    expect(figure.median).toBeLessThanOrEqual(figure.high)
    expect(figure.drivers).toBeGreaterThan(0)
  })
})

describe('price guide content', () => {
  it.each(LOCALES)('has the same structure in %s', (locale) => {
    const content = buildPriceGuide(locale)
    expect(content.rows.map((row) => row.key)).toEqual(Object.keys(PRICE_GUIDE))
    expect(content.highlights).toHaveLength(3)
    expect(content.examples).toHaveLength(3)
    expect(content.faq).toHaveLength(6)
  })

  it.each(LOCALES)('keeps search snippets a usable length in %s', (locale) => {
    const content = buildPriceGuide(locale)
    expect(content.title.length).toBeLessThanOrEqual(70)
    expect(content.description.length).toBeLessThanOrEqual(190)
  })

  it('calculates the examples from the published figures', () => {
    const nbsp = ' '
    const { examples } = buildPriceGuide('en')
    expect(examples[1]?.result).toBe(`7${nbsp}200 ֏`)
    expect(examples[2]?.result).toBe(`30${nbsp}000 – 50${nbsp}000 ֏`)
  })
})

describe('price guide discoverability', () => {
  it('is linked from every page and listed in the sitemap', () => {
    expect(FOOTER_PAGES.map((page) => page.to)).toContain('/gner')
    expect(readFileSync(`${ROOT}server/routes/sitemap.xml.ts`, 'utf8')).toContain("path: '/gner'")
  })
})
