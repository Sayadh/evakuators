import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SOCIAL_LINKS } from '~/constants/site'

/**
 * `/links` — the link-in-bio page an Instagram or TikTok bio points at.
 *
 * Source-read rather than mounted, the same way `featuredStripOrder.spec.ts`
 * is: the properties worth protecting here are all decisions in the file, and
 * a render test would pin the markup instead — which is the part that should
 * be free to change.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const page = readFileSync(`${ROOT}pages/links.vue`, 'utf8')
const layout = readFileSync(`${ROOT}layouts/bare.vue`, 'utf8')

describe('/links', () => {
  it('renders the profiles from SOCIAL_LINKS, not from a second copy of them', () => {
    // The failure this prevents is quiet: a handle changes, the footer and the
    // `sameAs` in the Organization schema follow, and this page keeps sending
    // people to a profile that no longer exists.
    expect(page).toContain('SOCIAL_LINKS')
    for (const social of SOCIAL_LINKS) {
      expect(page, `${social.label} URL is hard-coded here`).not.toContain(social.url)
    }
  })

  it('opens every profile in a new tab, with the opener sealed off', () => {
    // `target="_blank"` without `rel="noopener"` hands the opened page a live
    // `window.opener` back into ours.
    expect(page).toContain('target="_blank"')
    expect(page).toContain('rel="noopener noreferrer"')
  })

  it('keeps the site link internal, so it is a client-side navigation', () => {
    // The one destination we own. An `<a href>` to the homepage would reload
    // the whole app to reach a route already in the bundle.
    expect(page).toContain('<NuxtLinkLocale to="/"')
  })

  it('has no header, and drops the layout rather than hiding the chrome in CSS', () => {
    expect(page).toContain("definePageMeta({ layout: 'bare' })")
    expect(layout).not.toContain('AppHeader')
    expect(layout).not.toContain('AppFooter')
  })

  it('still shows the consent banner, which is the one thing the layout keeps', () => {
    // `app.vue` counts a visit on every route including this one, so a page
    // rendered without the banner would measure its visitors while giving them
    // nothing to answer — and for many this is the first page of the domain
    // they ever load.
    expect(layout).toContain('CookieConsentBanner')
  })

  it('is Armenian only, and says so to both the router and the crawler', () => {
    // `defineI18nRoute` is what makes /ru/links and /en/links 404;
    // `locales` is what keeps the page from advertising them in `hreflang`.
    // One without the other is a page pointing at its own missing translations.
    expect(page).toContain("defineI18nRoute({ locales: ['hy'] })")
    expect(page).toContain("locales: ['hy'],")
  })

  it('is noindex, and is therefore absent from the sitemap', () => {
    const sitemap = readFileSync(`${ROOT}server/routes/sitemap.xml.ts`, 'utf8')
    expect(page).toContain('noindex: true')
    // Listing a noindex URL asks a crawler to index what the page tells it not
    // to — the two signals have to agree.
    expect(sitemap).not.toContain('/links')
  })
})
