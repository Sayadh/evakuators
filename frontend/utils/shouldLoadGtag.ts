import { SITE_URL } from '~/constants/site'

/**
 * The one id this check treats specially — production's real GA4 property.
 *
 * Hardcoded rather than read from config, on purpose: this is the value the
 * check exists to protect, so it cannot be the same value the check reads its
 * permission from. `AW-18328135826` (Google Ads conversion) is not a second
 * id anywhere in this codebase — it fires through this SAME `gtag('config',
 * ...)` call, linked to the GA4 property in Google's own UI, so refusing this
 * one id refuses both at once.
 */
const PRODUCTION_GTAG_ID = 'G-HEN3RVMTRG'

/** Derived from the single source of truth for the domain, not a second copy of the string. */
const PRODUCTION_HOSTNAME = new URL(SITE_URL).hostname

/**
 * Whether gtag.js should load at all, given the id `NUXT_PUBLIC_GTAG_ID`
 * resolved to and the hostname actually serving the page.
 *
 * Two independent reasons to refuse, checked in order:
 *
 * 1. **No id.** `frontend/nuxt.config.ts` defaults `gtag.id` to `''`, so an
 *    environment that never set `NUXT_PUBLIC_GTAG_ID` (staging, by design —
 *    see `ecosystem.staging.config.js` — or a developer's own machine) gets
 *    nothing, silently, with no analytics call of any kind.
 * 2. **Production's real id, wrong hostname.** The hard invariant: even if a
 *    future deploy script, `.env` copy, or config edit ever carried
 *    `G-HEN3RVMTRG` into a non-production build by mistake, that one
 *    specific id still never fires from anywhere but `evakuators.am`. A
 *    DIFFERENT id — a staging property's own test id, say — is allowed
 *    through on any hostname; this guards one specific value, not "any id
 *    off the production domain".
 */
export function shouldLoadGtag(id: string | undefined, hostname: string): boolean {
  if (!id) return false
  if (id === PRODUCTION_GTAG_ID && hostname !== PRODUCTION_HOSTNAME) return false
  return true
}
