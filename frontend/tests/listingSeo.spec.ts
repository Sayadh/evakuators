import { describe, expect, it } from 'vitest'
import { MANIPULATOR_PAGE, VEHICLE_TYPE_GEOS } from '~/constants/vehicleTypePages'
import { buildCityFaq, buildRegionFaq } from '~/utils/faqContent'
import { buildLocationSeo, buildRegionSeo, listingFacts } from '~/utils/seoContent'
import { buildVehicleTypeSeo } from '~/utils/vehicleTypeSeo'

const NBSP = ' '
const stats = { count: 25, lowestPrice: 5000, works24: 21 }
const empty = { count: 0, lowestPrice: null, works24: 0 }
const LOCALES = ['hy', 'ru', 'en']

describe('listingFacts', () => {
  it('names the count and the lowest price', () => {
    expect(listingFacts(stats, 'hy')).toBe(`25 վարորդ, 5${NBSP}000 ֏-ից`)
    expect(listingFacts(stats, 'ru')).toBe(`25 водителей, от 5${NBSP}000 ֏`)
  })

  it('is null for an empty or unknown listing', () => {
    expect(listingFacts(empty)).toBeNull()
    expect(listingFacts(undefined)).toBeNull()
  })
})

describe('area titles', () => {
  it('put the facts before the Latin spelling', () => {
    expect(buildLocationSeo('Արաբկիր', 'arabkir', 'hy', 'district', stats).title).toBe(
      `Էվակուատոր Արաբկիրում 24/7 — 25 վարորդ, 5${NBSP}000 ֏-ից · Evakuator arabkir`,
    )
    expect(buildLocationSeo('Արաբկիր', 'arabkir', 'ru', 'district', stats).description).toMatch(
      /^Вызвать эвакуатор в районе Арабкир круглосуточно: 25 водителей/,
    )
  })

  it('keep the regular copy without drivers', () => {
    expect(buildLocationSeo('Գյումրի', 'gyumri', 'hy', 'city', empty)).toEqual(
      buildLocationSeo('Գյումրի', 'gyumri', 'hy', 'city'),
    )
    expect(buildRegionSeo('Շիրակ', 'shirak', 'ru', empty)).toEqual(buildRegionSeo('Շիրակ', 'shirak', 'ru'))
  })

  it.each(LOCALES)('keep the visible facts inside ~60 characters for a long name in %s', (locale) => {
    const { title } = buildLocationSeo('Մալաթիա-Սեբաստիա', 'malatia-sebastia', locale, 'district', stats)
    expect(title.indexOf(' · ')).toBeLessThanOrEqual(70)
  })
})

describe('vehicle-type titles', () => {
  it('lead with the live facts', () => {
    expect(buildVehicleTypeSeo(MANIPULATOR_PAGE, undefined, 'hy', stats).title).toMatch(
      /^Մանիպուլյատորով էվակուատոր Հայաստանում — 25 վարորդ/,
    )
  })

  it('add the facts to an area description without repeating the heading', () => {
    const geo = VEHICLE_TYPE_GEOS.find((item) => item.slug === 'yerevan')!
    const { description } = buildVehicleTypeSeo(MANIPULATOR_PAGE, geo, 'hy', stats)
    expect(description).toMatch(/\) — 25 վարորդ/)
    expect(description.split(MANIPULATOR_PAGE.heading).length - 1).toBe(1)
  })

  it('keep the regular copy for an empty listing', () => {
    expect(buildVehicleTypeSeo(MANIPULATOR_PAGE, undefined, 'hy', empty)).toEqual(
      buildVehicleTypeSeo(MANIPULATOR_PAGE, undefined, 'hy'),
    )
  })
})

describe('area FAQs', () => {
  it.each(LOCALES)('quote the page\'s own numbers in %s', (locale) => {
    const faq = buildCityFaq('Գյումրի', locale, 'gyumri', stats)
    expect(faq[0]?.answer).toContain('5')
    expect(faq[2]?.answer).toContain('21')
    expect(buildRegionFaq('Շիրակ', locale, 'shirak', stats)[0]?.answer).toContain('25')
  })

  it('fall back to the regular copy without drivers', () => {
    expect(buildCityFaq('Գյումրի', 'hy', 'gyumri', empty)).toEqual(buildCityFaq('Գյումրի', 'hy', 'gyumri'))
  })
})
