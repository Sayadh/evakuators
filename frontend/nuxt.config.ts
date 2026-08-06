export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  // 3002 is reserved for this frontend — 4002 is the Evakuators backend, never swap them.
  // Production also honors PORT/HOST env vars directly (nitro node-server preset).
  devServer: { port: 3002 },

  modules: ['@pinia/nuxt', '@vueuse/nuxt', '@nuxt/image', '@nuxt/eslint', 'nuxt-gtag'],

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
