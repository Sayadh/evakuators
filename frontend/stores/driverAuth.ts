import { defineStore } from 'pinia'
import type { DriverSession } from '~/repositories/driverAuth.repository'

const STORAGE_KEY = 'evakuators:driver-session'

export const useDriverAuthStore = defineStore('driverAuth', {
  state: () => ({
    session: null as DriverSession | null,
    initialized: false,
  }),

  getters: {
    isLoggedIn: (state) => state.session !== null,
    authHeader: (state) =>
      state.session ? { Authorization: `Bearer ${state.session.token}` } : {},
    /**
     * Whether the dashboard must force a password change before anything else.
     *
     * Falls back to `false` when there is no session, so this can be read
     * before `init()` has run without briefly claiming a logged-out visitor
     * owes us a password change.
     */
    mustChangePassword: (state) => state.session?.mustChangePassword ?? false,
  },

  actions: {
    init() {
      if (!import.meta.client || this.initialized) return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        this.session = raw ? (JSON.parse(raw) as DriverSession) : null
      } catch {
        this.session = null
      }
      this.initialized = true
    },

    login(session: DriverSession) {
      this.session = session
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    },

    /**
     * Clears the forced-change flag after a successful password change.
     *
     * Written back to localStorage, not just to state: without that, a reload
     * would restore the stored session with `mustChangePassword: true` and put
     * the driver back in front of a dialog they already dealt with — and the
     * backend would reject their old password on the second attempt, leaving
     * them stuck. The token itself is untouched; the flag describes the
     * password, not the session.
     */
    markPasswordChanged() {
      if (!this.session) return
      this.session = { ...this.session, mustChangePassword: false }
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session))
    },

    logout() {
      this.session = null
      if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
    },
  },
})
