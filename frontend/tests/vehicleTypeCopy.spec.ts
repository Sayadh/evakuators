import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VEHICLE_TYPE_GEOS, VEHICLE_TYPE_PAGE_LIST } from '~/constants/vehicleTypePages'
import {
  countryLocative,
  countryName,
  localizedVehicleTypeGeo,
  localizedVehicleTypePage,
} from '~/i18n/vehicleTypeCopy'
import {
  buildVehicleTypeHeading,
  buildVehicleTypeParagraphs,
  buildVehicleTypeSeo,
  buildVehicleTypeSeoTitle,
} from '~/utils/vehicleTypeSeo'

/**
 * `/manipulator` and `/tsanr-tehnika` in Russian and English.
 *
 * These two pages are the ones an ad campaign points at for a query that is
 * not «էվակուատոր» — someone who needs a crane, or something that can carry a
 * bus — and they are also linked from the bottom of every city and marz page.
 * A single Armenian word left in them is visible on most of the site.
 *
 * The assertions are about *what language the output is in*, not about the
 * exact wording: a translator improving a sentence should not have to edit a
 * test, but nobody should be able to add a page, a marz or an FAQ answer that
 * silently renders Armenian to a Russian visitor.
 */

const ARMENIAN = /[԰-֏]/

/**
 * The Latin transliterations are deliberately identical in all three languages
 * — they are what people type on a Latin keyboard, not words in any of them —
 * so they are stripped before the "is this Armenian" check rather than being
 * exempted case by case.
 */
const LATIN_QUERY_TERMS = /manipulator(ov)?|tsanr[- ]tehnika(yi)?|evakuator|hayastan|krunkov/gi

function foreignText(value: string): string {
  return value.replace(LATIN_QUERY_TERMS, '')
}

describe('the vehicle-type pages in Russian and English', () => {
  it('leaves the Armanian config untouched for hy', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(localizedVehicleTypePage(page, 'hy')).toBe(page)
    }
  })

  it('falls back to Armenian for a locale it has no copy for', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(localizedVehicleTypePage(page, 'fr')).toBe(page)
    }
  })

  for (const locale of ['ru', 'en'] as const) {
    it(`translates every visible field of both pages into ${locale}`, () => {
      for (const source of VEHICLE_TYPE_PAGE_LIST) {
        const page = localizedVehicleTypePage(source, locale)

        for (const value of [page.navLabel, page.heading, page.title, page.description]) {
          expect(foreignText(value), `${source.slug}: ${value}`).not.toMatch(ARMENIAN)
        }

        expect(foreignText(page.seo.serviceSummary)).not.toMatch(ARMENIAN)
        expect(foreignText(page.seo.metaTeaser)).not.toMatch(ARMENIAN)
        expect(foreignText(page.seo.explainer)).not.toMatch(ARMENIAN)
        expect(foreignText(page.seo.whenNeeded)).not.toMatch(ARMENIAN)
        for (const keyword of page.seo.extraKeywords) {
          expect(foreignText(keyword), keyword).not.toMatch(ARMENIAN)
        }

        // The FAQ is rendered on the page AND emitted as `FAQPage` JSON-LD from
        // the same array, so an untranslated answer is both visible and indexed.
        expect(page.faq).toHaveLength(source.faq.length)
        for (const item of page.faq) {
          expect(foreignText(item.question), item.question).not.toMatch(ARMENIAN)
          expect(foreignText(item.answer), item.answer).not.toMatch(ARMENIAN)
        }
      }
    })

    it(`names every area in ${locale}`, () => {
      for (const source of VEHICLE_TYPE_GEOS) {
        const geo = localizedVehicleTypeGeo(source, locale)
        expect(geo.name, source.slug).not.toMatch(ARMENIAN)
        expect(geo.locative, source.slug).not.toMatch(ARMENIAN)
        // The slug is the route and must survive translation untouched.
        expect(geo.slug).toBe(source.slug)
      }
    })

    it(`builds the heading, the metadata and the body copy in ${locale}`, () => {
      const page = localizedVehicleTypePage(VEHICLE_TYPE_PAGE_LIST[0], locale)
      const geo = localizedVehicleTypeGeo(
        VEHICLE_TYPE_GEOS.find((item) => item.slug === 'kotayk')!,
        locale,
      )

      for (const scope of [undefined, geo]) {
        const seo = buildVehicleTypeSeo(page, scope, locale)
        expect(foreignText(buildVehicleTypeHeading(page, scope, locale))).not.toMatch(ARMENIAN)
        expect(foreignText(buildVehicleTypeSeoTitle(page, scope, locale))).not.toMatch(ARMENIAN)
        expect(foreignText(seo.title)).not.toMatch(ARMENIAN)
        expect(foreignText(seo.description)).not.toMatch(ARMENIAN)
        expect(foreignText(seo.keywords)).not.toMatch(ARMENIAN)
        for (const paragraph of buildVehicleTypeParagraphs(page, scope, locale)) {
          expect(foreignText(paragraph)).not.toMatch(ARMENIAN)
        }
      }
    })
  }

  it('still writes Armenian for hy', () => {
    const page = VEHICLE_TYPE_PAGE_LIST[0]
    expect(countryLocative('hy')).toBe('Հայաստանում')
    expect(countryName('hy')).toBe('Հայաստան')
    expect(buildVehicleTypeHeading(page)).toMatch(ARMENIAN)
    expect(buildVehicleTypeSeo(page).description).toMatch(ARMENIAN)
    expect(buildVehicleTypeParagraphs(page).join(' ')).toMatch(ARMENIAN)
  })

  it('keeps the transliterated queries in every language', () => {
    // The one term all three share. Deleting it from the Russian or English
    // copy would drop the query form the local competition actually ranks for.
    for (const locale of ['hy', 'ru', 'en']) {
      const page = localizedVehicleTypePage(VEHICLE_TYPE_PAGE_LIST[0], locale)
      expect(page.seo.keywordTranslit).toBe('manipulatorov evakuator')
      expect(buildVehicleTypeSeo(page, undefined, locale).keywords).toContain('evakuator')
    }
  })
})

describe('the components read the translated config', () => {
  const read = (path: string): string =>
    readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8')

  it('the listing localises the page and the area before using either', () => {
    const source = read('components/vehicle-type/VehicleTypeListing.vue')
    expect(source).toContain('localizedVehicleTypePage(props.page, locale.value)')
    expect(source).toContain('localizedVehicleTypeGeo(props.geo, locale.value)')
    // Nothing below may reach past the translated pair back to the raw props.
    expect(source).not.toMatch(/buildVehicleType\w+\(props\.page/)
    expect(source).not.toContain('forVehicleType(props.page)')
    expect(source).not.toContain(':items="page.faq"')
  })

  it('the cross-link block on every geography page localises both', () => {
    const source = read('components/vehicle-type/SpecialVehicleCrossLinks.vue')
    expect(source).toContain('localizedVehicleTypePage(source, locale.value)')
    expect(source).toContain('localizedVehicleTypeGeo(found, locale.value)')
  })

  it('the area chips localise each marz', () => {
    const source = read('components/vehicle-type/VehicleTypeGeoLinks.vue')
    expect(source).toContain('localizedVehicleTypeGeo(geo, locale.value)')
    expect(source).not.toContain('Ամբողջ Հայաստանում')
  })
})
