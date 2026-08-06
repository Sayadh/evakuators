import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SITE_ALTERNATE_NAME,
  SITE_NAME,
  SITE_ORGANIZATION_DESCRIPTION,
  SITE_TAGLINE,
  SITE_URL,
  SITE_URL_ROOT,
  SOCIAL_LINKS,
} from '~/constants/site'
import { buildSiteIdentitySchema } from '~/utils/schemaOrg'
import { buildHomeSeo, buildLocationSeo } from '~/utils/seoContent'

/**
 * Brand identity, asserted rather than reviewed.
 *
 * ## The specific risk
 *
 * A singular `.am` domain one letter away from ours belongs to somebody else.
 * Every place this project names itself is a chance to be merged with it, and
 * the failure is silent: nothing breaks, a search engine simply attributes the
 * wrong entity. The defence is that the name exists in exactly one constant and
 * everything else derives from it, so these tests check the derivation rather
 * than re-typing the string in twenty assertions.
 *
 * The singular form is asserted to appear NOWHERE — not in copy, not in
 * metadata, and not in a source comment explaining why it must not appear.
 * That absolute rule is what makes the check trustworthy: an exception list
 * would be the first thing a future edit slips through.
 *
 * ## What is deliberately NOT checked
 *
 * That page copy avoids the word «էվակուատոր». It must not — that is the
 * service, and the primary search term for it. The brand is `Evakuators.am`;
 * the service is «էվակուատոր»; conflating them would cost the rankings the
 * location pages exist for.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function read(relativePath: string): string {
  return readFileSync(`${ROOT}${relativePath}`, 'utf8')
}

/** Every file that could plausibly name the site, as shipped text */
const BRAND_SURFACES = [
  'nuxt.config.ts',
  'constants/site.ts',
  'utils/schemaOrg.ts',
  'utils/seoContent.ts',
  'components/layout/AppHeader.vue',
  'components/layout/AppFooter.vue',
  'components/home/HeroSection.vue',
  'public/site.webmanifest',
  'pages/index.vue',
]

describe('brand name', () => {
  it('is spelled with the plural s', () => {
    expect(SITE_NAME).toBe('Evakuators.am')
  })

  /**
   * The singular form, matched with a negative lookbehind so `Evakuators.am`
   * itself does not trigger it. This is the assertion the whole file exists for.
   *
   * Built from `SITE_NAME` rather than written out, so the forbidden string
   * cannot appear in this repository even here.
   */
  it('never appears in its singular form, anywhere', () => {
    const singular = new RegExp(`(?<!s)\\b${SITE_NAME.replace('s.am', '\\.am')}`, 'i')
    const offenders = BRAND_SURFACES.filter((file) => singular.test(read(file)))
    expect(
      offenders,
      'These files name the site with the singular spelling — a domain that belongs to somebody else.',
    ).toEqual([])
  })

  it('is what nuxt.config declares as application-name', () => {
    // Hard-coded there because nuxt.config is evaluated outside the app's
    // module graph and cannot import from `~`. This is the check that keeps
    // the literal honest.
    const config = read('nuxt.config.ts')
    expect(config).toContain(`{ name: 'application-name', content: '${SITE_NAME}' }`)
  })

  it('is what the web manifest declares, under both name keys', () => {
    const manifest = JSON.parse(read('public/site.webmanifest')) as Record<string, unknown>
    expect(manifest.name).toBe(SITE_NAME)
    expect(manifest.short_name).toBe(SITE_NAME)
    expect(manifest.description).toBe(SITE_ORGANIZATION_DESCRIPTION)
    // Not "standalone": the manifest is here to declare a name, not to turn the
    // site into an installable app, which would change how it opens for anyone
    // who added it to a home screen.
    expect(manifest.display).toBe('browser')
    expect(manifest.start_url).toBe(SITE_URL_ROOT)
  })

  it('is the alt text on both logos', () => {
    expect(read('components/layout/AppHeader.vue')).toContain(`alt="${SITE_NAME}"`)
    expect(read('components/layout/AppFooter.vue')).toContain(`alt="${SITE_NAME}"`)
  })
})

describe('canonical origin', () => {
  it('is https, apex, and has no trailing slash', () => {
    expect(SITE_URL).toBe('https://evakuators.am')
  })

  it('exposes the root form with the slash schema.org expects', () => {
    expect(SITE_URL_ROOT).toBe('https://evakuators.am/')
  })
})

describe('homepage positioning', () => {
  it('uses the tagline verbatim as the title', () => {
    expect(SITE_TAGLINE).toBe('Evakuators.am — Հայաստանի էվակուատորների որոնման հարթակ')
    expect(buildHomeSeo().title).toBe(SITE_TAGLINE)
  })

  it('opens the description with the same statement', () => {
    expect(buildHomeSeo().description.startsWith(SITE_TAGLINE)).toBe(true)
  })

  it('keeps the service keyword in the description', () => {
    // Brand-first must not mean keyword-free: this page still has to rank for
    // the term people actually type.
    expect(buildHomeSeo().description).toContain('էվակուատոր')
  })

  it('names the brand in the H1', () => {
    expect(read('components/home/HeroSection.vue')).toContain(
      `<h1 class="hero__title">`,
    )
    const hero = read('components/home/HeroSection.vue')
    const h1 = hero.slice(hero.indexOf('<h1'), hero.indexOf('</h1>'))
    expect(h1).toContain(SITE_NAME)
    expect(h1).toContain('էվակուատոր')
  })
})

describe('location page titles', () => {
  const seo = buildLocationSeo('Աբովյան', 'abovyan')

  it('end with the exact brand', () => {
    expect(seo.title.endsWith(`| ${SITE_NAME}`)).toBe(true)
  })

  it('still lead with the service keyword, not the brand', () => {
    // The opposite of the homepage rule, and deliberately so: these pages exist
    // to answer a query, and the query is «էվակուատոր <city>».
    expect(seo.title.startsWith('Էվակուատոր')).toBe(true)
  })
})

describe('site identity structured data', () => {
  const schema = buildSiteIdentitySchema()
  const graph = schema['@graph'] as Array<Record<string, unknown>>

  it('is serialisable as valid JSON', () => {
    // useJsonLd inlines JSON.stringify output into a <script>. A value that
    // cannot round-trip would ship as broken structured data with no error.
    expect(() => JSON.parse(JSON.stringify(schema)) as unknown).not.toThrow()
  })

  it('is a single graph with one Organization and one WebSite', () => {
    expect(schema['@context']).toBe('https://schema.org')
    expect(graph).toHaveLength(2)
    expect(graph.filter((node) => node['@type'] === 'Organization')).toHaveLength(1)
    expect(graph.filter((node) => node['@type'] === 'WebSite')).toHaveLength(1)
  })

  it('describes the Organization with the brand, root URL and an ImageObject logo', () => {
    const org = graph.find((node) => node['@type'] === 'Organization')!
    expect(org['@id']).toBe(`${SITE_URL}/#organization`)
    expect(org.name).toBe(SITE_NAME)
    expect(org.url).toBe(SITE_URL_ROOT)
    expect(org.description).toBe(SITE_ORGANIZATION_DESCRIPTION)
    expect(org.logo).toEqual({
      '@type': 'ImageObject',
      url: `${SITE_URL}/evakuators-logo.png`,
    })
  })

  it('ties the WebSite to the Organization by @id, not by repeating it', () => {
    const site = graph.find((node) => node['@type'] === 'WebSite')!
    expect(site['@id']).toBe(`${SITE_URL}/#website`)
    expect(site.name).toBe(SITE_NAME)
    expect(site.url).toBe(SITE_URL_ROOT)
    expect(site.alternateName).toBe(SITE_ALTERNATE_NAME)
    expect(site.inLanguage).toBe('hy-AM')
    // A reference, so the two nodes are one entity described twice rather than
    // two entities that happen to share a name.
    expect(site.publisher).toEqual({ '@id': `${SITE_URL}/#organization` })
  })

  it('publishes only social URLs that exist in the project', () => {
    const org = graph.find((node) => node['@type'] === 'Organization')!
    // sameAs is read as a claim of identity — an invented or dead profile URL
    // points the entity at somebody else, which is worse than saying nothing.
    expect(org.sameAs).toEqual(SOCIAL_LINKS.map((social) => social.url))
    for (const url of SOCIAL_LINKS) {
      expect(url.url.startsWith('https://')).toBe(true)
    }
  })
})
