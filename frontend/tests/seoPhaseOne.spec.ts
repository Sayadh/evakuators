import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VehicleType } from '~/types/enums'
import { buildCityFaq, buildHomeFaq } from '~/utils/faqContent'
import { getInactiveTowTruckRoute } from '~/utils/inactiveTowTruckRoute'
import { buildYerevanListingTitle } from '~/utils/seoContent'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const NBSP = ' '

const placement = {
  regionSlug: null,
  citySlug: null,
  districtSlug: null,
  vehicleType: 'flatbed',
}

describe('buildYerevanListingTitle', () => {
  it('names the count and the lowest listed price in each language', () => {
    const prices = [7000, 5000, null, 10000]
    expect(buildYerevanListingTitle(prices, 'hy')).toBe(
      `Էվակուատոր Երևանում · Evakuator erevan 24/7 — 4 վարորդ, 5${NBSP}000 ֏-ից`,
    )
    expect(buildYerevanListingTitle(prices, 'ru')).toBe(
      `Эвакуатор Ереван · Evakuator erevan 24/7 — 4 водителя, от 5${NBSP}000 ֏`,
    )
    expect(buildYerevanListingTitle(prices, 'en')).toBe(
      `Tow truck in Yerevan · Evakuator erevan 24/7 — 4 drivers, from 5${NBSP}000 ֏`,
    )
  })

  it.each([
    [1, '1 водитель'],
    [3, '3 водителя'],
    [11, '11 водителей'],
    [21, '21 водитель'],
    [43, '43 водителя'],
    [45, '45 водителей'],
  ])('declines the Russian word for %i', (count, expected) => {
    const title = buildYerevanListingTitle(Array(count).fill(null), 'ru')
    expect(title?.endsWith(`— ${expected}`)).toBe(true)
  })

  it('drops only the price when no driver listed one', () => {
    expect(buildYerevanListingTitle([null, 0], 'hy')).toMatch(/— 2 վարորդ$/)
  })

  it('returns null without drivers, so the page keeps its regular title', () => {
    expect(buildYerevanListingTitle([], 'hy')).toBeNull()
  })
})

describe('getInactiveTowTruckRoute', () => {
  it('prefers the most specific area', () => {
    expect(getInactiveTowTruckRoute({ ...placement, districtSlug: 'arabkir' })).toBe(
      '/yerevan/arabkir',
    )
    expect(
      getInactiveTowTruckRoute({ ...placement, regionSlug: 'shirak', citySlug: 'gyumri' }),
    ).toBe('/regions/shirak/gyumri')
    expect(getInactiveTowTruckRoute({ ...placement, regionSlug: 'shirak' })).toBe('/regions/shirak')
    expect(getInactiveTowTruckRoute(placement)).toBe('/regions')
  })

  it('sends specialist trucks to their landing page, not a listing that hides them', () => {
    expect(
      getInactiveTowTruckRoute({
        ...placement,
        districtSlug: 'arabkir',
        vehicleType: VehicleType.Manipulator,
      }),
    ).toBe('/manipulator')
    expect(
      getInactiveTowTruckRoute({
        ...placement,
        regionSlug: 'shirak',
        vehicleType: VehicleType.HeavyDuty,
      }),
    ).toBe('/tsanr-tehnika')
  })
})

describe('published copy and locale tags', () => {
  it.each(['hy', 'ru', 'en'])('FAQ prices match the driver cards in %s', (locale) => {
    const text = JSON.stringify([buildHomeFaq(locale), buildCityFaq('Գյումրի', locale)])
    expect(text).toMatch(/5[ ,]000 ?– ?10[ ,]000/)
    expect(text).not.toMatch(/9[ ,]000|15[ ,]000/)
  })

  it('does not tie the Russian and English versions to Russia and the US', () => {
    const config = readFileSync(`${ROOT}nuxt.config.ts`, 'utf8')
    expect(config).toContain("{ code: 'ru', language: 'ru',")
    expect(config).toContain("{ code: 'en', language: 'en',")
  })
})
