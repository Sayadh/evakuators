import { describe, expect, it } from 'vitest'
import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { staticServiceZones } from '~/data/serviceZones'
import { localizedPlaceName, translatedSlugs, type PlaceKind } from '~/i18n/placeNames'

/**
 * Every city, district, marz and corridor has a Russian and an English name.
 *
 * ## Why this is enumerated from the data rather than listed
 *
 * Because the failure is silent and permanent. `localizedPlaceName` falls back
 * to the Armenian name, on purpose — a page that says «Աբովյան» to a Russian
 * reader is worse than one that says "Abovyan" and better than one that says
 * `abovyan` or nothing. But that fallback also means a town added next year
 * appears in Armenian on the Russian site forever, and nothing anywhere says
 * so: no error, no warning, no failing build. This is the thing that says so.
 */

const SETS: { kind: PlaceKind; slugs: string[] }[] = [
  { kind: 'region', slugs: staticRegions.map((r) => r.slug) },
  { kind: 'city', slugs: staticCities.map((c) => c.slug) },
  { kind: 'district', slugs: staticDistricts.map((d) => d.slug) },
  { kind: 'zone', slugs: staticServiceZones.map((z) => z.slug) },
]

const ARMENIAN = /[԰-֏]/

describe.each(SETS)('$kind names', ({ kind, slugs }) => {
  it('covers every slug in the data, in Russian', () => {
    const missing = slugs.filter((slug) => !translatedSlugs('ru', kind).includes(slug))
    expect(missing).toEqual([])
  })

  it('covers every slug in the data, in English', () => {
    const missing = slugs.filter((slug) => !translatedSlugs('en', kind).includes(slug))
    expect(missing).toEqual([])
  })

  it('translates none of them back into Armenian', () => {
    for (const slug of slugs) {
      expect(localizedPlaceName(kind, slug, 'ARMENIAN', 'ru')).not.toMatch(ARMENIAN)
      expect(localizedPlaceName(kind, slug, 'ARMENIAN', 'en')).not.toMatch(ARMENIAN)
    }
  })

  it('lists no slug the data does not have', () => {
    // A rename that was applied to the data and not here leaves a dead entry
    // and an untranslated town, and the test above would still pass if the map
    // happened to be a superset.
    for (const locale of ['ru', 'en'] as const) {
      const extra = translatedSlugs(locale, kind).filter((slug) => !slugs.includes(slug))
      expect({ locale, extra }).toEqual({ locale, extra: [] })
    }
  })
})

describe('localizedPlaceName', () => {
  it('keeps Armenian for Armenian', () => {
    expect(localizedPlaceName('city', 'abovyan', 'Աբովյան', 'hy')).toBe('Աբովյան')
  })

  it('tells a town from the marz that shares its slug', () => {
    // `ararat` and `armavir` are each both. One flat map would silently give a
    // town its region's name.
    expect(localizedPlaceName('city', 'ararat', 'Արարատ', 'ru')).toBe('Арарат')
    expect(localizedPlaceName('region', 'ararat', 'Արարատ', 'ru')).toBe('Арарат')
  })

  it('knows Yerevan, which is not in staticRegions at all', () => {
    // A pseudo-region — see utils/geography.ts. It is also the single
    // most-searched word on the site.
    expect(localizedPlaceName('region', 'yerevan', 'Երևան', 'ru')).toBe('Ереван')
    expect(localizedPlaceName('region', 'yerevan', 'Երևան', 'en')).toBe('Yerevan')
  })

  it('falls back to the Armenian name for a settlement', () => {
    // The 300 villages are deliberately not translated: nobody searches for
    // them in Russian, and 300 hand-written names would be 300 chances for a
    // wrong one. A word in the wrong alphabet still beats a slug.
    expect(localizedPlaceName('city', 'ptghni', 'Պտղնի', 'ru')).toBe('Պտղնի')
  })
})
