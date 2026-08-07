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
    '/admin': { ssr: false },
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
         */
        'img-src': ["'self'", 'data:', 'blob:', 'https://xmdgvutudwciacyfnzat.supabase.co'],

        'font-src': ["'self'", 'data:'],

        /** The API, plus where Google Analytics actually posts its beacons. */
        'connect-src': [
          "'self'",
          'https://api.evakuators.am',
          'https://www.google-analytics.com',
          'https://*.google-analytics.com',
          'https://*.analytics.google.com',
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
    },
  },

  gtag: {
    id: 'G-HEN3RVMTRG',
    enabled: true,
  },

  typescript: {
    strict: true,
  },

  devtools: { enabled: true },
})
