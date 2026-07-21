export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

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
       * Backend API base URL (e.g. https://api.evakuators.am).
       * Empty string = API disabled → the app falls back to local mock data.
       * Override with NUXT_PUBLIC_API_BASE.
       */
      apiBase: '',
    },
  },

  typescript: {
    strict: true,
  },

  devtools: { enabled: true },
})
