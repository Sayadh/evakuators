import { useCookieConsentStore } from '~/stores/cookieConsent'
import { isAdminRoute } from '~/utils/isAdminRoute'
import { shouldLoadPixel } from '~/utils/shouldLoadPixel'
import { shouldTrackPixelPageView } from '~/utils/shouldTrackPixelPageView'

/** The subset of Meta's `fbq` queue-stub shape this file actually touches. */
type FbqFunction = {
  (...args: unknown[]): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  loaded: boolean
  version: string
  push: FbqFunction
}

declare global {
  interface Window {
    fbq?: FbqFunction
    _fbq?: FbqFunction
  }
}

/**
 * Meta's own loader — the same queue-stub-then-`fbevents.js` snippet Meta
 * publishes, written out instead of injected as the inline `<script>` block
 * Meta gives you: this site's CSP has no `'unsafe-inline'` for scripts (see
 * `nuxt.config.ts`), so that block cannot run as given, and `connect.
 * facebook.net` is listed in `script-src` for the `<script>` tag this
 * function creates instead.
 *
 * Guarded on `window.fbq` already existing, not a module-scope flag — so it
 * is genuinely safe to call more than once rather than merely documented as
 * such, the same property `loadPixelScript` itself relies on before ever
 * calling this.
 */
function installFbqStub(): void {
  if (window.fbq) return

  const fbq = ((...args: unknown[]): void => {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue.push(args)
  }) as FbqFunction
  fbq.queue = []
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.push = fbq

  window.fbq = fbq
  window._fbq = fbq
}

/** Injects the real `fbevents.js`, once — see `installFbqStub` for why `window.fbq` is the guard. */
function loadPixelScript(): void {
  if (window.fbq) return
  installFbqStub()

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)
}

/**
 * Gates and drives the Meta Pixel — the direct counterpart to
 * `plugins/gtag-gate.client.ts`, and gated on four things:
 *
 * 1. **Is there a real id for this environment, on this hostname** —
 *    `shouldLoadPixel()`, same two rules as `shouldLoadGtag()`.
 * 2. **Is this `/admin`** — `isAdminRoute()`, same reasoning as the gtag
 *    gate: an internal, login-gated panel has no reason to run public-site
 *    ad tracking.
 * 3. **Has the visitor accepted cookies** — `useCookieConsentStore()`. Unlike
 *    the other two, this can change mid-session (the banner is answered
 *    after the plugin has already run once), so it is re-checked on its own
 *    watcher, not only at startup.
 * 4. **Is this `npm run dev`** — `import.meta.dev`. `shouldLoadPixel()` only
 *    refuses the one hardcoded production id off the production hostname; a
 *    DIFFERENT id — a developer's own `.env`, or a copied-over `.env` that
 *    happens to carry a real, currently-active pixel id — is otherwise
 *    allowed through on any hostname, including `localhost`, which would
 *    mean every click during local development fires a real event at
 *    whatever Meta property that id belongs to. This gate stays out of
 *    `shouldLoadPixel()` itself, same reason `isAdminRoute()` and the
 *    consent check do: it is a static, compile-time flag, not something the
 *    id/hostname pair alone can decide, and folding it in would make the one
 *    pure, directly-tested piece of this gate depend on the bundler.
 *
 * `initialize()` (here, `start()`) runs at most once — guarded by `started`,
 * exactly like `gtag-gate`'s own flag — and sends the FIRST `PageView` itself
 * rather than leaving it to the route watcher, so a visitor who never
 * navigates again still counts as one view. Every `PageView` after that,
 * initial or route-change, goes through `shouldTrackPixelPageView` so the
 * same path can never fire twice in a row.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()
  const {
    public: { metaPixelId },
  } = useRuntimeConfig()
  const consent = useCookieConsentStore()

  const allowed = (path: string): boolean =>
    !import.meta.dev &&
    shouldLoadPixel(metaPixelId, window.location.hostname) &&
    !isAdminRoute(path) &&
    consent.status === 'accepted'

  let started = false
  let lastTrackedPath: string | null = null

  const trackPageView = (path: string): void => {
    if (!shouldTrackPixelPageView(lastTrackedPath, path)) return
    lastTrackedPath = path
    window.fbq?.('track', 'PageView')
  }

  const start = (path: string): void => {
    if (started) return
    started = true
    loadPixelScript()
    window.fbq?.('init', metaPixelId)
    trackPageView(path)
  }

  const sync = (path: string): void => {
    if (!allowed(path)) return
    if (started) trackPageView(path)
    else start(path)
  }

  sync(route.path)
  watch(() => route.path, sync)
  // Consent answered after this plugin already ran once — the only way
  // `allowed()` can flip from false to true mid-session, since the id and the
  // admin-route boundary are both fixed for the life of the page.
  watch(() => consent.status, () => sync(route.path))
})
