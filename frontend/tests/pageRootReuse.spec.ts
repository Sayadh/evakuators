import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The bug these pin, in one line: an unkeyed `<NuxtPage>` let Vue patch one
 * page into another's root element, and the dashboard spent its life inside
 * the login page's `<div>`.
 *
 * The symptom was the whole dashboard laid out in a row — header, gate,
 * sections side by side — because the element it had been patched into carried
 * `.login-page { display: flex }` and a `class` Vue never repatched. It only
 * happened after an actual sign-in, so it was invisible to anyone who already
 * had a session and constant for every driver who did not.
 *
 * Source-read rather than mounted: what has to hold is a decision in two
 * files, and reproducing it in a test would mean reproducing Nuxt's router.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const app = readFileSync(`${ROOT}app.vue`, 'utf8')
const login = readFileSync(`${ROOT}pages/login.vue`, 'utf8')

describe('one page cannot be patched into another\'s root element', () => {
  it('gives every page an explicit key', () => {
    // Nuxt's own `generateRouteKey` returns `undefined` when it cannot match
    // the resolved component back to a route record — which is what happens on
    // a lazily loaded, client-only route reached by navigating. `RouteProvider`
    // is then rendered with no key, and two different pages become the same
    // vnode as far as Vue is concerned.
    expect(app).toContain('<NuxtPage :page-key=')
  })

  it('derives that key from the route, rather than pinning a constant', () => {
    // A constant key is the opposite failure: every navigation would reuse one
    // page instance forever.
    expect(app).toMatch(/:page-key="\(route\) => route\.\w+"/)
  })

  it('keys on the path, so a filter change does not throw the page away', () => {
    // The listing pages keep their filters in the query string. `fullPath`
    // would remount on every one of them — losing the fetched list, the
    // scroll position and the shuffle seed.
    expect(app).toContain('route.path')
    expect(app).not.toContain('route.fullPath')
  })

  it('keeps the login page root out of the business of laying things out', () => {
    // Defence in depth for the one page that navigates INTO another: the key
    // above stops the reuse, and this stops a reuse from being catastrophic if
    // it ever returns. A page root that centres a single card can do it with a
    // margin, and a margin cannot reflow somebody else's page.
    const rule = login.slice(login.indexOf('.login-page {'), login.indexOf('.login-card {'))
    expect(rule).not.toContain('display: flex')
    expect(rule).not.toContain('display: grid')
    expect(login).toContain('margin-inline: auto')
  })
})
