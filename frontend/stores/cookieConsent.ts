import { defineStore } from 'pinia'

export type CookieConsentStatus = 'pending' | 'accepted' | 'rejected'

const STORAGE_KEY = 'evakuators:cookie-consent'

function isAnsweredStatus(value: string | null): value is 'accepted' | 'rejected' {
  return value === 'accepted' || value === 'rejected'
}

/**
 * The one visitor-facing consent gate this site has — see `docs/analytics.md`
 * for why the internal per-provider counters are a SEPARATE system and are
 * not gated on this at all (they are our own first-party stats, not a
 * third-party pixel). This store exists specifically for the two trackers
 * that ARE third-party: GA4/Ads (`plugins/gtag-gate.client.ts`) and the Meta
 * Pixel (`plugins/meta-pixel.client.ts`). Both read `status` and start only
 * once it is `'accepted'` — never on `'pending'`, same as a fresh visitor who
 * has not answered yet.
 *
 * `'pending'` is also the default before hydration runs (see `init`), which
 * is what a server render and the pre-hydration client both show — so there
 * is no flash between two different "have they answered" states, only a
 * legitimate one-time update once `init()` reads what the visitor answered
 * on a previous visit.
 */
export const useCookieConsentStore = defineStore('cookieConsent', {
  state: () => ({
    status: 'pending' as CookieConsentStatus,
    initialized: false,
  }),

  actions: {
    /** Hydrates from localStorage — see `plugins/initStores.client.ts` */
    init() {
      if (!import.meta.client || this.initialized) return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        this.status = isAnsweredStatus(raw) ? raw : 'pending'
      } catch {
        this.status = 'pending'
      }
      this.initialized = true
    },

    accept() {
      this.status = 'accepted'
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, 'accepted')
    },

    reject() {
      this.status = 'rejected'
      if (import.meta.client) localStorage.setItem(STORAGE_KEY, 'rejected')
    },
  },
})
