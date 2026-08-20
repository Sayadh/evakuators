import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { NAV_LINKS } from '~/constants/navigation'
import {
  HEAVY_DUTY_PAGE,
  MANIPULATOR_PAGE,
  VEHICLE_TYPE_PAGE_LIST,
  VEHICLE_TYPE_PAGES,
} from '~/constants/vehicleTypePages'
import { VehicleType } from '~/types/enums'

/**
 * The two vehicle-type landing pages.
 *
 * The failure this guards against is not a broken page — it is a page that
 * exists in one place and not another: in the nav but not the sitemap, or with
 * a route no file serves. `/free-routes` was missing from the sitemap once for
 * exactly that reason, which is why everything here is derived from one list
 * and why this asserts the derivation actually holds.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

describe('the config', () => {
  it('describes exactly the two pages', () => {
    expect(VEHICLE_TYPE_PAGE_LIST).toHaveLength(2)
    expect(VEHICLE_TYPE_PAGE_LIST.map((page) => page.slug)).toEqual([
      'manipulator',
      'tsanr-tehnika',
    ])
  })

  it('points at real vehicle types', () => {
    // A typo here would render a page that quietly matches nothing at all.
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(Object.keys(VEHICLE_TYPE_LABELS), page.slug).toContain(page.vehicleType)
    }
    expect(MANIPULATOR_PAGE.vehicleType).toBe(VehicleType.Manipulator)
    expect(HEAVY_DUTY_PAGE.vehicleType).toBe(VehicleType.HeavyDuty)
  })

  it('agrees with the slug the backend branches on', () => {
    /**
     * MANUAL SYNC POINT. `HEAVY_DUTY_PAGE.vehicleType` is what travels as
     * `?vehicleType=`, and the backend compares it literally to decide whether
     * to apply the union (the type OR the admin-set `heavyEquipment` flag).
     * A drift does not error anywhere — the page just silently stops
     * including every truck an admin ticked, which is the whole feature.
     *
     * Read as text because the two apps share no code (CLAUDE.md).
     */
    const backend = readFileSync(
      `${ROOT}../backend/src/tow-trucks/vehicle-types.ts`,
      'utf8',
    )

    expect(backend).toContain(`HEAVY_DUTY_VEHICLE_TYPE = '${HEAVY_DUTY_PAGE.vehicleType}'`)
    // A union, not an equality — the `||` is the flag half. An intersection
    // here would drop every admin-ticked flatbed off the page.
    expect(backend).toContain('heavyEquipment || vehicleType === HEAVY_DUTY_VEHICLE_TYPE')
  })

  it('keys the lookup by the slug it stores', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(VEHICLE_TYPE_PAGES[page.slug as keyof typeof VEHICLE_TYPE_PAGES]).toBe(page)
    }
  })

  it('gives every page the copy it needs', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(page.navLabel.length, page.slug).toBeGreaterThan(0)
      expect(page.heading.length, page.slug).toBeGreaterThan(0)
      expect(page.title.length, page.slug).toBeGreaterThan(0)
      // These pages carry no on-page prose, so the meta description is the
      // whole of what a search result shows under the title — it has to be
      // there, and it has to fit. Google truncates well before 200 characters.
      expect(page.description.length, page.slug).toBeGreaterThan(0)
      expect(page.description.length, page.slug).toBeLessThanOrEqual(200)
    }
  })

  it('uses lowercase kebab-case slugs, since they are public URLs', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(page.slug, page.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })
})

describe('every page exists everywhere it is promised', () => {
  it('has a page file per slug', () => {
    // Nuxt routes by filename, so a slug with no file is a 404 in the nav.
    // A directory with an `index.vue`, not `<slug>.vue`: `[geo].vue` sits
    // beside it and serves `/manipulator/yerevan`.
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      const index = `pages/${page.slug}/index.vue`
      expect(existsSync(`${ROOT}${index}`), index).toBe(true)
    }
  })

  it('has an area route per slug', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      const geo = `pages/${page.slug}/[geo].vue`
      expect(existsSync(`${ROOT}${geo}`), geo).toBe(true)
    }
  })

  it('is in the header nav', () => {
    const targets = NAV_LINKS.map((link) => link.to)
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(targets, page.slug).toContain(`/${page.slug}`)
    }
  })

  it('is in the sitemap, derived from the same list', () => {
    // Asserted as source text rather than by running the route: the sitemap is
    // a Nitro handler and there is no server here (docs/testing.md).
    const sitemap = readFileSync(`${ROOT}server/routes/sitemap.xml.ts`, 'utf8')
    expect(sitemap).toContain('VEHICLE_TYPE_PAGE_LIST')
  })
})

describe('nothing comes before the drivers', () => {
  /**
   * The rule these pages are built on, stated precisely.
   *
   * It was once written as "the pages stay bare" and enforced as "no prose at
   * all", which was a proxy for the real constraint and eventually contradicted
   * it: a page whose only text is its `<h1>` is thin content that cannot rank
   * for the query it was built to answer, so it stopped being found and the
   * visitor never arrived to be un-delayed. The constraint that actually
   * matters is ORDER — nothing between someone who already knows what they
   * need and a phone number.
   *
   * So: no controls anywhere, and every block of text strictly after the cards.
   *
   * Asserted as source text because there is no component runtime here
   * (docs/testing.md). It is the kind of thing that gets re-added by copying
   * the city page, which is exactly what this file is here to notice.
   */
  const listing = readFileSync(`${ROOT}components/vehicle-type/VehicleTypeListing.vue`, 'utf8')
  const code = listing.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const template = code.slice(code.indexOf('<template>'))

  it('renders no filter or sort controls', () => {
    for (const banned of [
      'TowTruckFilters',
      'MobileFilterDrawer',
      'ActiveFilters',
      'TowTruckSort',
      'useTowTruckFilters',
      'useResponsiveFilters',
    ]) {
      expect(code, `${banned} is back on the vehicle-type pages`).not.toContain(banned)
    }
  })

  it('renders no nearest-search banner', () => {
    // A CTA to another page, above a list of the drivers this visitor asked
    // for, is the clearest possible version of getting in the way.
    expect(template).not.toContain('NearestTowTrucksCta')
  })

  it('still renders the cards', () => {
    // The assertions above and below are only meaningful if the page still has
    // the one thing it is for.
    expect(template).toContain('TowTruckList')
  })

  it('puts every text block after the listing', () => {
    // The FAQ, the SEO copy and the area links all earn their place for search
    // and for the visitor who did not find an answer in the cards — neither of
    // which is a reason to appear first.
    const cards = template.indexOf('TowTruckList')
    for (const block of ['VehicleTypeGeoLinks', 'SeoTextSection', 'FaqSection']) {
      expect(template).toContain(block)
      expect(template.indexOf(block), `${block} is above the listing`).toBeGreaterThan(cards)
    }
  })
})

describe('the FAQ is set up so search engines can use it', () => {
  it('gives every page real questions and answers', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(page.faq.length, page.slug).toBeGreaterThanOrEqual(3)
      for (const item of page.faq) {
        expect(item.question.length, `${page.slug}: ${item.question}`).toBeGreaterThan(10)
        // A one-line answer is what makes an FAQ look auto-generated. These are
        // the page's only prose, so they carry its whole body content.
        expect(item.answer.length, `${page.slug}: ${item.question}`).toBeGreaterThan(80)
      }
    }
  })

  it('asks each question only once per page', () => {
    // Duplicate `name` values inside one FAQPage is invalid structured data.
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      const questions = page.faq.map((item) => item.question)
      expect(new Set(questions).size, page.slug).toBe(questions.length)
    }
  })

  it('emits FAQPage JSON-LD from the same array it renders', () => {
    // Structured data that describes different questions from the visible text
    // is the thing Google treats as a violation, so the two must have one
    // source. FaqSection builds the schema from its own `items` prop.
    const faqSection = readFileSync(`${ROOT}components/seo/FaqSection.vue`, 'utf8')
    expect(faqSection).toContain('buildFaqSchema(props.items)')
  })

  it('does not repeat one page\'s questions on the other', () => {
    // Two pages sharing an FAQ is duplicate content, and these two are adjacent
    // enough that copy-paste is the obvious way to add the next one.
    const [first, second] = VEHICLE_TYPE_PAGE_LIST
    const firstQuestions = new Set(first!.faq.map((item) => item.question))
    for (const item of second!.faq) {
      expect(firstQuestions.has(item.question), item.question).toBe(false)
    }
  })
})

describe('the geography hubs kept a home', () => {
  /**
   * `/regions` and `/yerevan` left the header to make room for these two.
   * `/regions` is the entry point to every marz and city page — most of the
   * site — so losing its last site-wide link would be a real SEO regression,
   * not a nav tidy-up. The footer's column headings link them now.
   */
  const footer = readFileSync(`${ROOT}components/layout/AppFooter.vue`, 'utf8')

  it('links both hubs from the footer', () => {
    expect(footer).toContain('getRegionsRoute()')
    expect(footer).toContain('getYerevanRoute()')
  })

  it('no longer links them from the header', () => {
    const targets = NAV_LINKS.map((link) => link.to)
    expect(targets).not.toContain('/regions')
    expect(targets).not.toContain('/yerevan')
  })

  it('keeps the nav short enough to stay on one line', () => {
    // The constraint stated in constants/navigation.ts: two items were removed
    // once because the row wrapped on a laptop, and a nav that wraps stops
    // being scannable.
    expect(NAV_LINKS.length).toBeLessThanOrEqual(4)
  })
})
