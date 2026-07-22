export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  // 3002 is reserved for this frontend — 4002 is the Evakuators backend, never swap them.
  // Production also honors PORT/HOST env vars directly (nitro node-server preset).
  devServer: { port: 3002 },

  modules: ['@pinia/nuxt', '@vueuse/nuxt', '@nuxt/image', '@nuxt/eslint'],

  css: ['~/assets/styles/main.scss'],

  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    head: {
      htmlAttrs: { lang: 'hy' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#122a43' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  image: {
    domains: ['picsum.photos'],
  },

  runtimeConfig: {
    public: {
      siteUrl: 'https://evakuators.am',
      /**
       * Backend API base URL, including the version prefix
       * (e.g. https://api.evakuators.am/api/v1, or http://localhost:4002/api/v1 in dev).
       * Empty string = API disabled → the app falls back to local mock data.
       * Override with NUXT_PUBLIC_API_BASE_URL.
       */
      apiBaseUrl: '',
    },
  },

  typescript: {
    strict: true,
  },

  devtools: { enabled: true },
})
