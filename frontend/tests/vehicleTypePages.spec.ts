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

  it('keys the lookup by the slug it stores', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(VEHICLE_TYPE_PAGES[page.slug as keyof typeof VEHICLE_TYPE_PAGES]).toBe(page)
    }
  })

  it('gives every page the copy a landing page needs', () => {
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(page.navLabel.length, page.slug).toBeGreaterThan(0)
      expect(page.heading.length, page.slug).toBeGreaterThan(0)
      expect(page.title.length, page.slug).toBeGreaterThan(0)
      // Google truncates well before this; a description longer than it is one
      // nobody reads the end of.
      expect(page.description.length, page.slug).toBeLessThanOrEqual(200)
      expect(page.intro.length, page.slug).toBeGreaterThan(0)
      expect(page.faq.length, page.slug).toBeGreaterThan(0)
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
    for (const page of VEHICLE_TYPE_PAGE_LIST) {
      expect(existsSync(`${ROOT}pages/${page.slug}.vue`), `pages/${page.slug}.vue`).toBe(true)
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
