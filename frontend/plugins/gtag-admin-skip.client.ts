/**
 * Keeps Google's gtag.js off `/admin` entirely.
 *
 * `nuxt.config.ts` sets `gtag.initMode: 'manual'` specifically so nuxt-gtag's
 * own client plugin does NOT auto-inject the `<script src=".../gtag/js">` tag
 * on mount — this plugin is the only thing that ever calls `initialize()`,
 * and it simply never does while the current route is under `/admin`.
 *
 * `/admin` is a login-gated internal panel with no reason to run public-site
 * analytics or Ads conversion tracking. A direct visit to it — the normal way
 * in, since nobody clicks through from the public site into a login screen —
 * never requests `gtag.js` at all: no script tag, no `dataLayer`, no network
 * call, nothing for a CSP audit to have to justify.
 *
 * Two rarer cases, handled the same way a route guard would:
 * - Navigating INTO `/admin` mid-session (the script may already be on the
 *   page from an earlier public page): `disableAnalytics()` stops further
 *   hits. It cannot un-load an already-loaded script, but no more events go
 *   out from that point on.
 * - Navigating OUT of `/admin` to the public site, having never initialized:
 *   starts normally, exactly as a fresh visit to that page would have.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const { initialize, disableAnalytics } = useGtag()

  let started = false
  const start = (): void => {
    if (started) return
    started = true
    initialize()
  }

  if (isAdminRoute(route.path)) {
    disableAnalytics()
  } else {
    start()
  }

  watch(
    () => route.path,
    (path) => {
      if (isAdminRoute(path)) {
        disableAnalytics()
      } else {
        start()
      }
    },
  )
})
