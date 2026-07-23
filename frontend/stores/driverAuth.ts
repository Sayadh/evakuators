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

    logout() {
      this.session = null
      if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
    },
  },
})
