/**
 * The one place that decides whether Google's gtag.js is allowed to load at
 * all, and the only caller of `initialize()` — `nuxt.config.ts` sets
 * `gtag.initMode: 'manual'` specifically so nuxt-gtag's own client plugin
 * does NOT auto-inject the `<script src=".../gtag/js">` tag on mount.
 *
 * Two independent gates, both re-checked on every route change:
 *
 * ## 1. Is there a real id for this environment at all — `shouldLoadGtag()`
 *
 * `gtag.id` is `''` unless `NUXT_PUBLIC_GTAG_ID` set it (see the doc comment
 * on `gtag` in `nuxt.config.ts`), and even when it IS set, production's
 * specific id refuses to fire from any hostname but `evakuators.am` — see
 * `utils/shouldLoadGtag.ts` for the exact rule and why. Staging, by design,
 * never requests `gtag.js` at all: no script tag, no `dataLayer`, no network
 * call, nothing for a GTM audit to have to explain — and neither does GA4's
 * linked Google Ads conversion tracking (AW-18328135826), since it rides the
 * same script.
 *
 * ## 2. Is this `/admin` — `isAdminRoute()`
 *
 * `/admin` is a login-gated internal panel with no reason to run public-site
 * analytics or Ads conversion tracking even in an environment where gate 1
 * passes. A direct visit to it — the normal way in, since nobody clicks
 * through from the public site into a login screen — never requests
 * `gtag.js` either, for the same reason as gate 1 failing.
 *
 * ## Mid-session route changes
 *
 * - Navigating INTO a blocked state (either gate) after already loading:
 *   `disableAnalytics()` stops further hits. It cannot un-load an
 *   already-present script, but no more events go out from that point on.
 * - Navigating OUT of a blocked state, having never initialized: starts
 *   normally, exactly as a fresh visit to that page would have.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const { public: { gtag: gtagConfig } } = useRuntimeConfig()
  const { initialize, disableAnalytics } = useGtag()

  const allowed = (path: string): boolean =>
    shouldLoadGtag(gtagConfig?.id, window.location.hostname) && !isAdminRoute(path)

  let started = false
  const start = (): void => {
    if (started) return
    started = true
    initialize()
  }

  const sync = (path: string): void => {
    if (allowed(path)) start()
    else disableAnalytics()
  }

  sync(route.path)
  watch(() => route.path, sync)
})
