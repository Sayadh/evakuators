/**
 * Feature switches that have to be read from more than one place.
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
 * Scope is narrow on purpose: this switches off **the search itself**, and
 * nothing else. The header nav link, the CTA banners on the seven pages that
 * place them, and the sitemap entry all stay exactly where they are.
 *
 * That is a product decision, not an oversight. The banners are how visitors
 * find out the feature is coming: someone presses, reads that it is being
 * worked on, and leaves knowing the site will do this. Hiding the entry points
 * until launch day would mean launching to an audience that has never heard of
 * it. So while this is `false`, the page is an announcement rather than a dead
 * end — which is why `pages/evakuator.vue` still renders its full explanation,
 * and still offers the region/city search underneath.
 *
 * What `false` actually changes, in one place only: `findNearest()` returns the
 * "coming soon" message instead of asking for a position. The check sits before
 * `locate()` so no permission prompt is ever raised — a browser that is refused
 * once remembers it, and spending that permission on something we cannot yet
 * deliver would cost us the prompt we want at launch.
 *
 * Nothing on the backend is aware of this flag. The endpoint, the PostGIS
 * column and the migration stay live, so turning the feature on is this boolean
 * plus a frontend rebuild — no redeploy of the API, no migration to re-run.
 * It does additionally want `ROUTE_MATRIX_API_KEY` set on the backend: without
 * it the search still returns drivers, but every distance is straight-line and
 * no arrival times are shown. See `docs/nearest-search.md`.
 */
export const NEAREST_SEARCH_ENABLED = false
