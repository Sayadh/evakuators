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
    /**
     * Whether the dashboard must block on the privacy consent dialog.
     *
     * Same `?? false` fallback as above, and for the same reason: read before
     * `init()` has run, this must not claim a logged-out visitor owes us a
     * consent.
     *
     * It is the CACHED answer from login. The dashboard still asks the API on
     * load (`privacyConsentRepository.getStatus`), because this copy survives
     * both a policy version bump and a consent given in another tab — see
     * `syncPrivacyConsent`.
     */
    requiresPrivacyConsent: (state) => state.session?.requiresPrivacyConsent ?? false,
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

    /**
     * Writes the API's authoritative consent answer back into the cached
     * session.
     *
     * Takes the value rather than assuming `false`, because this is called in
     * two opposite situations and both are real: after the driver consents
     * (`false`), and after the dashboard's status read discovers the cached
     * `false` is stale — a policy bumped to 1.2, or a consent withdrawn from
     * another device — which must be able to turn the block back ON.
     *
     * Persisted for the same reason `markPasswordChanged` persists: without
     * it, a reload restores the stored session and puts the driver back in
     * front of a dialog they already answered. The token is untouched; the flag
     * describes the consent, not the session.
     */
    syncPrivacyConsent(requiresPrivacyConsent: boolean) {
      if (!this.session) return
      if (this.session.requiresPrivacyConsent === requiresPrivacyConsent) return
      this.session = { ...this.session, requiresPrivacyConsent }
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session))
    },

    logout() {
      this.session = null
      if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
    },
  },
})
