import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { staticRegions } from '~/data/regions'
import { SITE_NAME } from '~/constants/site'
import {
  REGION_LOCATIVES,
  VEHICLE_TYPE_GEOS,
  VEHICLE_TYPE_PAGE_LIST,
  findVehicleTypeGeo,
} from '~/constants/vehicleTypePages'
import {
  buildVehicleTypeHeading,
  buildVehicleTypeParagraphs,
  buildVehicleTypeSeo,
} from '~/utils/vehicleTypeSeo'
import { buildVehicleTypeServiceSchema } from '~/utils/schemaOrg'

/**
 * `/manipulator/yerevan`, `/tsanr-tehnika/kotayk` — eleven areas per vehicle
 * type, built so that «մանիպուլյատոր Երևան» has a page that is actually about
 * «մանիպուլյատոր Երևան».
 *
 * Almost nothing here can be checked by looking at a rendered page, because
 * the failures are all silent: a heading with «undefined» in it, eleven pages
 * that are copies of each other, a keyword list that forgot the place, an area
 * page announced in the sitemap with nothing on it.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const [MANIPULATOR, HEAVY_DUTY] = VEHICLE_TYPE_PAGE_LIST
const YEREVAN = findVehicleTypeGeo('yerevan')!
const KOTAYK = findVehicleTypeGeo('kotayk')!

describe('the geo list', () => {
  it('is Yerevan plus every marz, and nothing else', () => {
    expect(VEHICLE_TYPE_GEOS).toHaveLength(staticRegions.length + 1)
    expect(VEHICLE_TYPE_GEOS[0]!.slug).toBe('yerevan')
    expect(VEHICLE_TYPE_GEOS.filter((geo) => geo.isYerevan)).toHaveLength(1)
  })

  it('covers every marz in the static data', () => {
    // Derived from `staticRegions`, so this can only fail if the derivation is
    // replaced by a hand-written list — which is how a new marz ends up with a
    // footer link and no vehicle-type page.
    const slugs = new Set(VEHICLE_TYPE_GEOS.map((geo) => geo.slug))
    for (const region of staticRegions) {
      expect(slugs.has(region.slug), region.slug).toBe(true)
    }
  })

  it('gives every marz a hand-written locative', () => {
    // Asserted against the table rather than against the rendered string,
    // because for most marzes the correct form happens to equal what naive
    // concatenation would produce — so a missing entry would pass a
    // value-based check and only show up on the one name where it matters.
    for (const region of staticRegions) {
      expect(REGION_LOCATIVES[region.slug], region.slug).toBeTypeOf('string')
      expect(findVehicleTypeGeo(region.slug)!.locative, region.slug).toContain('մարզում')
    }
  })

  it('declines Լոռի correctly, which concatenation cannot', () => {
    // The reason the table exists at all. `utils/seoContent.ts` builds
    // `${name}ի մարզում` and therefore writes «Լոռիի մարզում» — in an <h1>.
    expect(findVehicleTypeGeo('lori')!.locative).toBe('Լոռու մարզում')
  })

  it('does not decline Yerevan as a marz', () => {
    expect(YEREVAN.locative).toBe('Երևանում')
    expect(YEREVAN.locative).not.toContain('մարզ')
  })

  it('resolves only real areas, so [geo] can 404 the rest', () => {
    expect(findVehicleTypeGeo('kotayk')).toBeDefined()
    expect(findVehicleTypeGeo('abovyan')).toBeUndefined()
    expect(findVehicleTypeGeo('')).toBeUndefined()
  })

  it('keeps Yerevan reachable under both Latin spellings, at least as a keyword', () => {
    // The URL can only be one of them; the other has to live in the metadata
    // or the «erevan» query is left on the table entirely.
    expect(YEREVAN.translitAliases).toContain('erevan')
  })
})

describe('the headings say where they are', () => {
  it('names the area', () => {
    expect(buildVehicleTypeHeading(MANIPULATOR!, YEREVAN)).toContain('Երևանում')
    expect(buildVehicleTypeHeading(MANIPULATOR!, KOTAYK)).toContain('Կոտայքի մարզում')
  })

  it('names the country on the parent page', () => {
    // Not left bare: an <h1> of «Մանիպուլյատորով էվակուատոր» describes a
    // vehicle, while the page is a directory of drivers.
    expect(buildVehicleTypeHeading(MANIPULATOR!)).toContain('Հայաստանում')
  })

  it('never renders undefined', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      for (const geo of VEHICLE_TYPE_GEOS) {
        expect(buildVehicleTypeHeading(page, geo)).not.toContain('undefined')
      }
    }
  })
})

describe('the metadata targets the query it was built for', () => {
  it('carries the place in the title, in Armenian and in Latin', () => {
    const seo = buildVehicleTypeSeo(MANIPULATOR!, YEREVAN)
    expect(seo.title).toContain('Երևանում')
    expect(seo.title).toContain('yerevan')
    expect(seo.title).toContain(SITE_NAME)
  })

  it('puts the short keyword and the place together, in that order', () => {
    // «manipulator yerevan» is how it is typed. A keyword list that only ever
    // writes the long form matches the short query weakly.
    const seo = buildVehicleTypeSeo(MANIPULATOR!, YEREVAN)
    expect(seo.keywords).toContain('manipulator yerevan')
    expect(seo.keywords).toContain('manipulator erevan')
    expect(seo.keywords).toContain('մանիպուլյատոր Երևան')
  })

  it('gives the heavy-duty page its own vocabulary', () => {
    const seo = buildVehicleTypeSeo(HEAVY_DUTY!, KOTAYK)
    expect(seo.keywords).toContain('tsanr tehnika kotayk')
    expect(seo.keywords).not.toContain('manipulator')
  })

  it('repeats no keyword', () => {
    // A duplicated term in this meta reads as stuffing rather than coverage,
    // and the country page is where the derived and hand-written lists collide.
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      for (const geo of [undefined, ...VEHICLE_TYPE_GEOS]) {
        const terms = buildVehicleTypeSeo(page, geo).keywords.split(', ')
        expect(new Set(terms).size, `${page.slug}/${geo?.slug ?? '-'}`).toBe(terms.length)
      }
    }
  })

  it('writes a description short enough to survive a search result', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      for (const geo of [undefined, ...VEHICLE_TYPE_GEOS]) {
        const { description } = buildVehicleTypeSeo(page, geo)
        expect(description.length, `${page.slug}/${geo?.slug ?? '-'}`).toBeGreaterThan(80)
        // The same 200 the config test holds `page.description` to. Google
        // truncates well before this; past it the tail is simply never read.
        expect(description.length, `${page.slug}/${geo?.slug ?? '-'}`).toBeLessThanOrEqual(200)
      }
    }
  })

  it('gives each area page a description of its own', () => {
    // Eleven identical descriptions is eleven pages Google picks one of.
    const descriptions = VEHICLE_TYPE_GEOS.map(
      (geo) => buildVehicleTypeSeo(MANIPULATOR!, geo).description,
    )
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })
})

describe('the body copy is not eleven copies of one page', () => {
  it('opens on the area, before anything shared', () => {
    const [opener] = buildVehicleTypeParagraphs(MANIPULATOR!, KOTAYK)
    expect(opener).toContain('Կոտայքի մարզում')
  })

  it('gives every area a distinct first paragraph', () => {
    const openers = VEHICLE_TYPE_GEOS.map(
      (geo) => buildVehicleTypeParagraphs(MANIPULATOR!, geo)[0],
    )
    expect(new Set(openers).size).toBe(openers.length)
  })

  it('is real prose, not a keyword list', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      for (const geo of [undefined, ...VEHICLE_TYPE_GEOS]) {
        const paragraphs = buildVehicleTypeParagraphs(page, geo)
        expect(paragraphs.length).toBeGreaterThanOrEqual(3)
        for (const paragraph of paragraphs) {
          expect(paragraph.length, `${page.slug}/${geo?.slug ?? '-'}`).toBeGreaterThan(120)
          expect(paragraph).not.toContain('undefined')
        }
      }
    }
  })
})

describe('the Service schema', () => {
  it('describes the service, not a business', () => {
    // AutomotiveBusiness belongs to a driver's own profile. Two
    // business-shaped entities on one page is how a phone number gets
    // attributed to the wrong party.
    const schema = buildVehicleTypeServiceSchema(MANIPULATOR!, YEREVAN)
    expect(schema['@type']).toBe('Service')
    expect(JSON.stringify(schema)).not.toContain('AutomotiveBusiness')
  })

  it('scopes itself to the area, with a stable id per URL', () => {
    const yerevan = buildVehicleTypeServiceSchema(MANIPULATOR!, YEREVAN)
    const country = buildVehicleTypeServiceSchema(MANIPULATOR!)

    expect(yerevan['@id']).toContain('/manipulator/yerevan')
    expect(country['@id']).toContain('/manipulator')
    expect(yerevan['@id']).not.toBe(country['@id'])
    expect(yerevan.areaServed).toMatchObject({ name: 'Երևան' })
    expect(country.areaServed).toMatchObject({ '@type': 'Country' })
  })

  it('claims no price', () => {
    // Prices belong to drivers and change per call; a page-level priceRange
    // would be a claim the platform cannot keep.
    const json = JSON.stringify(buildVehicleTypeServiceSchema(HEAVY_DUTY!, KOTAYK))
    expect(json).not.toContain('price')
    expect(json).not.toContain('offers')
  })
})

describe('the area pages are wired into the site', () => {
  it('has a [geo] route per vehicle type', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(existsSync(`${ROOT}pages/${page.slug}/[geo].vue`), page.slug).toBe(true)
    }
  })

  it('404s an unknown area instead of rendering the country list', () => {
    // A soft 404 that returns 200 is the shape search engines punish, and
    // `[geo]` matches any string at all.
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      const source = readFileSync(`${ROOT}pages/${page.slug}/[geo].vue`, 'utf8')
      expect(source, page.slug).toContain('findVehicleTypeGeo')
      expect(source, page.slug).toContain('statusCode: 404')
    }
  })

  it('noindexes an area page with no drivers', () => {
    // Otherwise it ranks for «մանիպուլյատոր Տավուշ» and shows an empty list —
    // the thin-page rule the landing settlements already follow.
    const listing = readFileSync(`${ROOT}components/vehicle-type/VehicleTypeListing.vue`, 'utf8')
    expect(listing).toContain('isThinAreaPage')
    expect(listing).toContain('noindex: isThinAreaPage.value')
  })

  it('links every area from the parent page, in server-rendered HTML', () => {
    // A URL nothing links to is reachable only through the sitemap, which is a
    // hint rather than a link. No select, no client-side filtering — real <a>s.
    const links = readFileSync(`${ROOT}components/vehicle-type/VehicleTypeGeoLinks.vue`, 'utf8')
    expect(links).toContain('VEHICLE_TYPE_GEOS')
    expect(links).toContain('getVehicleTypeGeoRoute')
    expect(links).toContain('NuxtLink')
  })

  it('links the vehicle-type pages from the geography pages', () => {
    // The other half of the internal-link plan: ~70 established pages pointing
    // at 22 new ones. Also the only place a visitor on a city page learns that
    // cranes exist, since the listing no longer contains them.
    for (const page of [
      'pages/regions/[region]/[city].vue',
      'pages/regions/[region]/index.vue',
      'pages/yerevan/[district].vue',
    ]) {
      expect(readFileSync(`${ROOT}${page}`, 'utf8'), page).toContain('SpecialVehicleCrossLinks')
    }
  })

  it('announces an area page only when it has a driver', () => {
    const sitemap = readFileSync(`${ROOT}server/routes/sitemap.xml.ts`, 'utf8')
    expect(sitemap).toContain('getIndexableVehicleTypeGeoPaths')
    // Reuses the walk it already did, and the same predicates the pages filter
    // with — not `/tow-trucks/coverage`, which excludes these trucks entirely.
    expect(sitemap).toContain('servesRegion')
    expect(sitemap).toContain('servesYerevan')
  })
})
