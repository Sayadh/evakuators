export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  // 3002 is reserved for this frontend — 4002 is the Evakuators backend, never swap them.
  // Production also honors PORT/HOST env vars directly (nitro node-server preset).
  devServer: { port: 3002 },

  modules: ['@pinia/nuxt', '@vueuse/nuxt', '@nuxt/image', '@nuxt/eslint', 'nuxt-gtag', 'nuxt-security'],

  css: ['~/assets/styles/main.scss'],

  components: [{ path: '~/components', pathPrefix: false }],

  routeRules: {
    // /admin's logged-in/logged-out branches depend on a localStorage token
    // the server can never see. SSR-ing it means the server always renders
    // "logged out", then the client plugin (initStores.client.ts) loads the
    // real token BEFORE hydration — Vue detects the mismatch and force-patches
    // the DOM, which is the "flashes to login, then opens" bug. Since this is
    // an internal, noindex-only panel, there's no SEO cost to just rendering
    // it fully client-side instead.
    //
    // BOTH patterns, deliberately. `/admin/**` does not match `/admin` itself
    // (a `**` segment needs something to match), and `/admin` does not cover
    // its children — so listing one alone would leave the other server-rendered
    // and reintroduce exactly that flash on half the panel. The review page at
    // `/admin/registrations/:id` is the reason there are children at all.
    '/admin': { ssr: false },
    '/admin/**': { ssr: false },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'hy' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#122a43' },
        /**
         * The brand, for consumers that read a name from the document rather
         * than from a title or from structured data — Windows tiles, some
         * bookmark and reader tools, and several crawlers.
         *
         * Hard-coded rather than imported from `constants/site.ts`: this file
         * is Nuxt's build-time config and is evaluated outside the app's module
         * graph, so the `~` alias is not available here. The literal is
         * asserted against SITE_NAME by tests/brandIdentity.spec.ts, which is
         * what keeps the two from drifting.
         */
        { name: 'application-name', content: 'Evakuators.am' },
        { name: 'apple-mobile-web-app-title', content: 'Evakuators.am' },
      ],
      /**
       * Favicon set. Every entry carries an explicit `sizes` (except the
       * vector one, where `any` is the correct answer) — without it a consumer
       * has to download each candidate to find out how big it is, and Google in
       * particular then picks unpredictably.
       *
       * Sizes are not arbitrary: **Google asks for a multiple of 48px** because
       * it downsizes to ~16px itself for the search result, and its downscaler
       * does a better job from 96px than any 16px file we could ship. This set
       * used to be 32×32 only, which is below that recommendation — a likely
       * reason a stale icon kept showing in search results. See
       * docs/pages-and-routes.md.
       */
      link: [
        // Modern browsers prefer this and scale it perfectly at any size.
        { rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: '/favicon.svg' },
        // What Google reads. 96 = 48 × 2.
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon.png' },
        // Android Chrome's fallback when there's no web manifest.
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon-192.png' },
        // iOS home screen. Declared rather than left to iOS's /apple-touch-icon.png
        // convention, so it can't silently break if the filename ever changes.
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        // Legacy, and the URL crawlers probe blindly at the domain root.
        // Genuinely multi-resolution (16+32+48 in the one file) — that is what
        // ICO is for, and a browser picking the tab size gets a purpose-rendered
        // 16px instead of a squashed 32px.
        { rel: 'icon', type: 'image/x-icon', sizes: '16x16 32x32 48x48', href: '/favicon.ico' },
        // Declares the brand name to Android Chrome, which otherwise derives an
        // app name from <title> — i.e. from whichever page happened to be open.
        // See public/site.webmanifest for why it deliberately does NOT turn the
        // site into an installable standalone app.
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },

  image: {
    // picsum.photos is only used by local mock data. The real domain is your
    // Supabase project's storage host (from backend/.env SUPABASE_URL) — without
    // it listed here, @nuxt/image's IPX provider won't optimize production photos.
    domains: ['picsum.photos', 'xmdgvutudwciacyfnzat.supabase.co'],
  },

  /**
   * Security response headers for the FRONTEND.
   *
   * The backend already sends its own full set (Helmet, in `backend/src/main.ts`)
   * — `api.evakuators.am` was never the gap. `evakuators.am` sent none at all,
   * because nothing had ever been configured to send them: not nginx, not the
   * app. They live here rather than in nginx deliberately. The server's nginx
   * config has already drifted from `nginx/evakuators.am.conf` once (the
   * port-80 redirect block was missing in production for months), and
   * `add_header` does not inherit into a `location` block that declares its own
   * — so a header added at server level silently disappears from `/_nuxt/` and
   * `/admin`. Configured here, they ship with the app, apply to every route,
   * and are reviewed in the same diff as the code they protect.
   *
   * This module is opinionated and ships far more than headers — a rate
   * limiter, an XSS request validator, a CORS handler and a request size limit,
   * all ON by default. Every one of them is disabled below: those concerns
   * belong to the backend, which already implements them against the real
   * threat model (see docs/auth-and-security.md § Throttling). Leaving them on
   * would mean two systems enforcing different limits on the same request, with
   * the frontend's copy having no idea what a driver JWT is.
   */
  security: {
    headers: {
      /**
       * Tells browsers to refuse plain HTTP for this host for a year. Only safe
       * now that all four non-canonical forms actually redirect — see
       * docs/deployment.md § nginx. `includeSubDomains` covers
       * staging/api/staging-api, which all serve HTTPS today.
       *
       * Deliberately NOT `preload`: that ships the domain in a browser-baked
       * list, and getting removed from it takes months. Worth doing later, on
       * purpose, not as a side effect of adding headers.
       */
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubdomains: true,
        preload: false,
      },

      /** No one embeds this site in a frame; clickjacking has no legitimate use here. */
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',

      /**
       * Send the full URL within the site, only the origin when leaving it. A
       * driver's profile URL should not travel to Facebook as a referrer, but
       * internal navigation analytics still work.
       */
      referrerPolicy: 'strict-origin-when-cross-origin',

      /**
       * Everything off except what the site actually asks for. `geolocation`
       * stays enabled for `/evakuator` (the nearest-search page asks for the
       * visitor's position — see docs/nearest-search.md); switching it off here
       * would break that feature the moment `NEAREST_SEARCH_ENABLED` is turned
       * back on, in a way that looks like a permissions bug in the browser.
       */
      permissionsPolicy: {
        geolocation: ['self'],
        camera: [],
        microphone: [],
        payment: [],
        usb: [],
        magnetometer: [],
        accelerometer: [],
        gyroscope: [],
        'interest-cohort': [],
      },

      /**
       * `require-corp` is the module's default and it would break every photo
       * on the site: Supabase Storage does not send `Cross-Origin-Resource-
       * Policy`, so a cross-origin image without CORP is refused under COEP.
       * Nothing here needs cross-origin isolation (no SharedArrayBuffer, no
       * high-resolution timers), so the correct value is off.
       */
      crossOriginEmbedderPolicy: 'unsafe-none',

      /**
       * Also relaxed from the module default (`same-origin`): tow truck photos
       * are served from Supabase and are meant to be embeddable by us.
       */
      crossOriginResourcePolicy: 'cross-origin',

      contentSecurityPolicy: {
        'default-src': ["'self'"],

        /**
         * Nonce plus `strict-dynamic`, not `'unsafe-inline'`.
         *
         * The page carries exactly one executable inline script — Nuxt's
         * `window.__NUXT__.config` — and blocking it breaks the whole app, so
         * something has to allow it. `'unsafe-inline'` would allow it *and*
         * anything an attacker manages to inject, which is the XSS vector CSP
         * exists to close. A per-response nonce allows only the script we
         * emitted.
         *
         * `'strict-dynamic'` is what makes Google Analytics work: nuxt-gtag
         * injects its loader at runtime from a nonced script, and under
         * strict-dynamic a trusted script's own children inherit that trust.
         * Without it the host allowlist below would have to grow every time
         * Google changes a domain — and modern browsers ignore host allowlists
         * entirely once strict-dynamic is present.
         *
         * The bare hosts remain for older browsers, which ignore
         * strict-dynamic and fall back to the list.
         */
        'script-src': [
          "'self'",
          "'nonce-{{nonce}}'",
          "'strict-dynamic'",
          'https://www.googletagmanager.com',
          // `fbevents.js` — `plugins/meta-pixel.client.ts` injects this host's
          // script tag itself rather than through a nonced loader (see that
          // file's `installFbqStub`/`loadPixelScript`), so it needs the bare
          // host here the same way `googletagmanager.com` does for browsers
          // that ignore `strict-dynamic`.
          'https://connect.facebook.net',
        ],

        /**
         * `'unsafe-inline'` here is not the same risk as it is for scripts —
         * an injected style cannot execute. It is required because Vue writes
         * inline `style` attributes for transitions and dynamic values.
         */
        'style-src': ["'self'", "'unsafe-inline'"],

        /**
         * `data:` for inlined SVG icons, `blob:` for the local previews the
         * registration and dashboard forms create from a chosen file before it
         * is ever uploaded (`URL.createObjectURL`) — without it a driver picks
         * a photo and sees a broken image.
         *
         * The Google hosts are Ads remarketing, which delivers some beacons as
         * *images* (`/pagead/1p-user-list/`, `/rmkt/collect`, `/ccm/collect`,
         * `/ads/ga-audiences`) rather than as fetches — so they need listing
         * here as well as in `connect-src`. `.am` because Google issues those
         * calls from the visitor's own country domain. `ad.doubleclick.net` is
         * the same family; see the note in `connect-src` for why it is its own
         * entry.
         *
         * `googletagmanager.com` here too — GTM sends its own container-health
         * pings as 1×1 image beacons (`/a`, `/td`), separate from the loader
         * script the container itself pulls in (that one is `script-src`, see
         * above). Without it every page view logged two blocked-image console
         * errors; nothing about the actual tags was affected.
         */
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://xmdgvutudwciacyfnzat.supabase.co',
          'https://www.google.com',
          'https://www.google.am',
          'https://ad.doubleclick.net',
          'https://www.googletagmanager.com',
          // The view-through conversion beacon (see `connect-src`) is sent as a
          // fetch when the browser allows it and falls back to a 1×1 image
          // otherwise, so it needs both entries — listing it only in
          // `connect-src` would swap one blocked-console-error for another on
          // exactly the browsers that take the fallback path.
          'https://googleads.g.doubleclick.net',
          // The Meta Pixel's own beacon (`/tr`) — same both-entries reasoning
          // as the view-through conversion beacon right above: `fbq` sends it
          // as a fetch when it can and falls back to a 1×1 image otherwise.
          'https://www.facebook.com',
        ],

        'font-src': ["'self'", 'data:'],

        /**
         * Where Google Analytics posts its beacons. **The API origin is
         * deliberately absent here** — it differs per environment
         * (`api.evakuators.am` vs `staging-api.evakuators.am`) while all
         * environments run the same build, so it is appended at boot from
         * `runtimeConfig.public.apiBaseUrl` by
         * `server/plugins/csp-api-origin.ts`. Hardcoding production's hostname
         * here is what made staging block every request it sent.
         */
        'connect-src': [
          "'self'",
          'https://www.google-analytics.com',
          'https://*.google-analytics.com',
          // Both the apex AND the wildcard, deliberately. A CSP wildcard
          // requires at least one label to match, so `*.analytics.google.com`
          // does NOT cover `analytics.google.com` itself — with only the
          // wildcard listed, GA's own `/g/collect` measurement calls were
          // refused while the policy looked correct at a glance. The wildcard
          // stays for the regional endpoints (`region1.analytics.google.com`).
          'https://analytics.google.com',
          'https://*.analytics.google.com',
          // Google Ads / remarketing beacons (`/g/collect`, `/ccm/collect`,
          // `/rmkt/collect`). A separate host from the analytics ones above,
          // and not covered by any of their wildcards. `.am` is there because
          // Google issues remarketing calls from the visitor's own country
          // domain — for this site's traffic that is almost always google.am,
          // not google.com.
          'https://www.google.com',
          'https://www.google.am',
          // `ad.doubleclick.net/ccm/s/collect` — the same remarketing feature
          // (GA4 Google Signals), but sent to a host that shares no suffix
          // with any entry above, so nothing here covered it and the browser
          // refused it on every page load. Only the audience/remarketing half
          // was affected: GA's own measurement goes to google-analytics.com,
          // which was allowed, so the stats were never wrong — the visible
          // symptom was purely a pair of console errors.
          //
          // Listed as the exact host, not `https://*.doubleclick.net`: the
          // wildcard would additionally admit every ad-serving subdomain
          // Google operates, which is a far wider permission than the one
          // beacon we are unblocking. If Google ever moves the beacon, the
          // right response is to add that host too, not to widen this one.
          'https://ad.doubleclick.net',
          // Google Ads conversion tracking (`/pagead/conversion/<id>/`) — a
          // third Google host, this one specific to the Ads conversion tag
          // rather than to Analytics or remarketing, and not covered by any
          // entry above.
          'https://www.googleadservices.com',
          // `stats.g.doubleclick.net/j/collect` (and `/r/collect`) — GA4
          // Google Signals again, but a fourth distinct host: neither the
          // `google-analytics.com` pair above nor `ad.doubleclick.net` covers
          // a `doubleclick.net` SUBDOMAIN, since the entry for that family is
          // deliberately the exact `ad.` host rather than a wildcard (see the
          // comment above it). Same reasoning applies here: add this host by
          // name, don't widen `ad.doubleclick.net` into `*.doubleclick.net`.
          'https://stats.g.doubleclick.net',
          // `googleads.g.doubleclick.net/pagead/viewthroughconversion/<id>/` —
          // the Google Ads view-through conversion beacon, and a fifth host.
          // Same family as `stats.g.doubleclick.net` directly above (both are
          // `*.g.doubleclick.net`) but a different label, and CSP matches host
          // names literally, so listing one has never covered the other.
          //
          // This is the second `.g.doubleclick.net` host to be added one at a
          // time. If a third ever appears, that is the point to replace both
          // with `https://*.g.doubleclick.net` — still far narrower than the
          // `*.doubleclick.net` the comments above rightly refuse, since `g.`
          // is Google's tag/measurement subdomain rather than the ad-serving
          // tree. Two hosts is not yet enough to justify the wildcard.
          'https://googleads.g.doubleclick.net',
          // The Meta Pixel's `/tr` beacon, fetch path — see the matching
          // `img-src` entry above for the fallback path and why both exist.
          'https://www.facebook.com',
        ],

        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'upgrade-insecure-requests': true,
      },
    },

    /**
     * Everything below is the backend's job, and it already does it properly.
     * See docs/auth-and-security.md — the throttle is per-IP with an SSR
     * exemption and stricter limits on the endpoints that guard a password,
     * none of which this module can know about.
     */
    rateLimiter: false,
    requestSizeLimiter: false,
    xssValidator: false,
    corsHandler: false,
  },

  runtimeConfig: {
    /**
     * Server-only API base URL, used for SSR fetches instead of the public one.
     * Override with NUXT_INTERNAL_API_BASE_URL; empty = fall back to the public
     * URL (correct for local dev, where both are localhost anyway).
     *
     * This exists because SSR requests do not come from the visitor's browser —
     * they come from this Nitro process. Sent to the public URL they go out
     * through nginx and reach the backend carrying ONE source address for the
     * whole site, so every visitor's server-rendered page shares a single
     * ThrottlerGuard bucket (60 req/min, see backend app.module.ts) and the
     * site starts 429-ing itself at a few dozen page views per minute.
     * Pointing SSR at the backend's loopback address instead both skips that
     * shared bucket (see SsrAwareThrottlerGuard) and removes a pointless
     * TLS + nginx round-trip from every render.
     */
    internalApiBaseUrl: '',

    public: {
      siteUrl: 'https://evakuators.am',
      /**
       * Backend API base URL, including the version prefix
       * (e.g. https://api.evakuators.am/api/v1, or http://localhost:4002/api/v1 in dev).
       * Empty string = API disabled → the app falls back to local mock data.
       * Override with NUXT_PUBLIC_API_BASE_URL.
       *
       * This is the URL the BROWSER uses. SSR uses internalApiBaseUrl above
       * when it is set — see `getApiBase()` in repositories/apiClient.ts.
       */
      apiBaseUrl: '',
      /**
       * Meta Pixel id. `''` by default — same "off unless a real environment
       * says otherwise" pattern as `apiBaseUrl` and the `gtag` id below.
       * Nuxt auto-replaces this with `NUXT_PUBLIC_META_PIXEL_ID` at runtime;
       * production's real id lives only in `ecosystem.config.js`, staging's
       * own file leaves it `''`. The only reader is
       * `plugins/meta-pixel.client.ts`, gated through `utils/shouldLoadPixel.ts`
       * exactly like `gtag.id` is gated through `shouldLoadGtag.ts`.
       */
      metaPixelId: '',
    },
  },

  /**
   * `id: ''` by default — same "off unless a real environment says
   * otherwise" default as `apiBaseUrl` above. Nuxt auto-replaces this with
   * `NUXT_PUBLIC_GTAG_ID` at runtime (nuxt-gtag's own documented mechanism,
   * `runtimeConfig.public.gtag.id`), so production's real measurement id
   * (`G-HEN3RVMTRG`) lives in `ecosystem.config.js`, never here — and
   * staging's own file sets it to `''` (or a separate test id, if staging
   * analytics is ever wanted) rather than inheriting production's by
   * accident. One build, two answers, exactly like the API base URL.
   *
   * `AW-18328135826` (Google Ads conversion) is not a second id anywhere in
   * this codebase — it fires through the SAME `gtag('config', 'G-...')`
   * call, via a Google-side link between the GA4 property and the Ads
   * account (configured in Google's own UI, not here). Whatever this file
   * decides for the GA4 id decides both at once.
   *
   * `initMode: 'manual'` — the default ("auto") has nuxt-gtag's own client
   * plugin inject the `gtag.js` script tag unconditionally, the moment the
   * app mounts, on every route including `/admin`, and on every hostname
   * this same build happens to be served from. `plugins/gtag-gate.client.ts`
   * is the only thing that ever calls `initialize()`, and it gates on BOTH
   * a real id being configured AND (belt and suspenders, see
   * `utils/shouldLoadGtag.ts`) production's specific id never firing from
   * anywhere but `evakuators.am` — see that file for the exact rules,
   * including the rarer case of navigating into or out of `/admin`
   * mid-session.
   */
  gtag: {
    id: '',
    enabled: true,
    initMode: 'manual',
  },

  typescript: {
    strict: true,
  },

  devtools: { enabled: true },
})
