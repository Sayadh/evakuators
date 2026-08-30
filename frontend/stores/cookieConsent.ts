import { defineStore } from 'pinia'
import { clearAnalyticsCookies } from '~/utils/clearAnalyticsCookies'

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

    /**
     * Also the revoke action — see `revisit()` below. Whether this is a
     * fresh visitor's first answer or someone reversing an earlier
     * `'accepted'` from the footer's «Cookie-ների կարգավորումներ» link, both
     * paths land here, so both get the same treatment: no further tracking
     * (the two plugins already refuse anything but `'accepted'`) AND any
     * cookie either tracker already set before this answer is removed.
     */
    reject() {
      this.status = 'rejected'
      if (import.meta.client) {
        localStorage.setItem(STORAGE_KEY, 'rejected')
        clearAnalyticsCookies()
      }
    },

    /**
     * Reopens the banner without touching localStorage — the footer's
     * «Cookie-ների կարգավորումներ» link, for a visitor who wants to change
     * or withdraw an answer they already gave. `status` going back to
     * `'pending'` is exactly what `CookieConsentBanner.vue`'s `visible`
     * already renders on, so no separate settings UI exists — the visitor
     * sees the same choice again and answers it through `accept()`/
     * `reject()` as normal. If they navigate away without choosing, the
     * previous answer is still the one in localStorage and stays
     * authoritative on the next visit.
     */
    revisit() {
      this.status = 'pending'
    },
  },
})
