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
  it('leads with the nearest search, and reaches it by link rather than by asking', () => {
    // `/evakuator` owns the permission prompt, the hour-long answer cache and
    // the daily routing allowance. Asking for a position here would raise a
    // prompt on a page nobody opened for that, and a browser that refuses once
    // remembers — which would cost the site the prompt it wants on the page
    // where the visitor chose this.
    expect(page).toContain('<NuxtLinkLocale to="/evakuator"')
    expect(page).not.toContain('useGeolocation(')
    expect(page).not.toContain('useNearestSearch(')
  })

  it('names the free routes the way `/free-routes` names them', () => {
    // That heading carries the borrowed «по пути» alongside the formal term,
    // and the borrowed one is what makes someone recognise the thing. Taking
    // the heading rather than retyping it is what keeps the two pages calling
    // it the same thing.
    expect(page).toContain('<NuxtLinkLocale to="/free-routes"')
    expect(page).toContain("t('freeRoutes.h1')")
    expect(page).not.toContain('Ազատ երթուղ')
  })

  it('takes that label from the key every other entry point uses', () => {
    // Seven placements share `nearest.cta` through `NearestTowTrucksCta`. This
    // page cannot use that component — it is an `AppButton` built for the
    // site's light surfaces — so the wording is the one thing that has to come
    // from the same place. A retyped label is a label that drifts.
    expect(page).toContain("t('nearest.cta')")
    expect(page).not.toContain('Գտնել')
  })

  it('sits below the site card, which is the page\'s first destination', () => {
    // Source order is the order on the page, and the order is a product
    // decision rather than an accident of how the template was assembled —
    // so it is pinned. The nearest search does not need to be first to be
    // found: it is the only filled card on the page.
    const nearest = page.indexOf('to="/evakuator"')
    expect(nearest).toBeGreaterThan(-1)
    expect(nearest).toBeGreaterThan(page.indexOf('class="site"'))
  })

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
