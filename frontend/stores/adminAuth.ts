import { defineStore } from 'pinia'

const STORAGE_KEY = 'evakuators:admin-auth'

/**
 * The `/admin` frontend page and `/api/v1/admin` backend routes are both
 * protected at the nginx layer with HTTP Basic Auth (see README +
 * nginx/evakuators.am.conf). The browser natively handles Basic Auth for the
 * frontend page itself (full navigation → native prompt), but it does NOT
 * automatically attach those credentials to cross-origin fetch() calls made
 * from the SPA to api.evakuators.am. So the admin panel asks for the same
 * username/password once, keeps it (base64-encoded) in localStorage, and
 * attaches it as an explicit `Authorization: Basic ...` header on every
 * admin API call — exactly what nginx's auth_basic_user_file expects.
 */
export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    credentials: null as string | null, // base64("username:password")
    initialized: false,
  }),

  getters: {
    isLoggedIn: (state) => state.credentials !== null,
    authHeader: (state) =>
      state.credentials ? { Authorization: `Basic ${state.credentials}` } : {},
  },

  actions: {
    init() {
      if (!import.meta.client || this.initialized) return
      this.credentials = localStorage.getItem(STORAGE_KEY)
      this.initialized = true
    },

    login(username: string, password: string) {
      this.credentials = btoa(`${username}:${password}`)
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, this.credentials)
    },

    logout() {
      this.credentials = null
      if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
    },
  },
})
