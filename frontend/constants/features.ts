/**
 * Feature switches that have to be read from more than one place.
 *
 * A switch belongs here — rather than as a `const` inside the page it guards —
 * as soon as turning the feature off means hiding something ELSE: a nav link, a
 * banner, a sitemap entry. Keeping it local is how a feature ends up disabled
 * on its own page while the rest of the site still advertises it.
 *
 * Build-time constants, not runtime config, deliberately. These decide what
 * renders during SSR, so a runtime value would have to be identical on the
 * server and in the browser or hydration would mismatch — and an env var that
 * must never differ between two processes is a constant with extra steps. Every
 * flip here is a deploy, which is the right weight for a decision this visible.
 */

/**
 * «Գտնել մոտակա էվակուատորները» — the geolocation search at `/evakuator`.
 *
 * When `false`, four things go together and must stay together:
 *
 * 1. `/evakuator` still exists and still renders, but the button reports that
 *    the feature is being worked on and no permission prompt is ever raised.
 * 2. The header nav link is not rendered (`NAV_LINKS`).
 * 3. The in-content CTA banners are not rendered (`NearestTowTrucksCta`), which
 *    covers the homepage, the region/city/district listings and every driver
 *    profile in one place.
 * 4. `/evakuator` is dropped from `sitemap.xml`.
 *
 * The page itself is kept alive rather than removed so that any link already
 * shared, indexed or bookmarked lands on an explanation instead of a 404 — and
 * so that turning the feature back on is one boolean, not a re-wiring.
 *
 * Turning it on additionally requires `ROUTE_MATRIX_API_KEY` on the backend.
 * Without it the search still works and still returns drivers, but every
 * distance is straight-line and no arrival times are shown — see
 * `docs/nearest-search.md`.
 */
export const NEAREST_SEARCH_ENABLED = false
