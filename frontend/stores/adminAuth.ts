import { defineStore } from 'pinia'

const STORAGE_KEY = 'evakuators:admin-session'

/**
 * Backend-issued JWT (POST /admin-auth/login, see AdminAuthModule) — replaces
 * the earlier nginx Basic Auth approach, which broke on cross-origin fetch()
 * preflight and kept the password sitting in localStorage indefinitely.
 * A Bearer token has none of that: normal CORS, and it naturally expires (24h).
 */
export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    token: null as string | null,
    initialized: false,
  }),

  getters: {
    isLoggedIn: (state) => state.token !== null,
    authHeader: (state) => (state.token ? { Authorization: `Bearer ${state.token}` } : {}),
  },

  actions: {
    init() {
      if (!import.meta.client || this.initialized) return
      this.token = localStorage.getItem(STORAGE_KEY)
      this.initialized = true
    },

    login(token: string) {
      this.token = token
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, token)
    },

    logout() {
      this.token = null
      if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
    },
  },
})
