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
    /**
     * The role claim, read from the token for NAVIGATION ONLY (a DISPATCHER
     * is sent to /admin/orders). Never an authorisation decision — every API
     * route checks the signed token server-side.
     */
    role: (state): 'ADMIN' | 'DISPATCHER' | null => {
      if (!state.token) return null
      try {
        const payload = JSON.parse(atob(state.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
        return payload.role === 'DISPATCHER' ? 'DISPATCHER' : payload.role === 'ADMIN' ? 'ADMIN' : null
      } catch {
        return null
      }
    },
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
