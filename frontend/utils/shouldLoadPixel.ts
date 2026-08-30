import { SITE_URL } from '~/constants/site'

/**
 * Production's real Meta Pixel id. Same defensive shape as
 * `shouldLoadGtag.ts`'s `PRODUCTION_GTAG_ID` — hardcoded rather than read
 * from config, on purpose: this is the value the check exists to protect, so
 * it cannot be the same value the check reads its permission from.
 */
const PRODUCTION_PIXEL_ID = '1596253742133677'

/** Derived from the single source of truth for the domain, not a second copy of the string. */
const PRODUCTION_HOSTNAME = new URL(SITE_URL).hostname

/**
 * Whether the Meta Pixel should load at all, given the id
 * `NUXT_PUBLIC_META_PIXEL_ID` resolved to and the hostname actually serving
 * the page.
 *
 * Exactly `shouldLoadGtag`'s two rules, for the same two reasons — see that
 * file for the fuller write-up:
 *
 * 1. **No id.** `frontend/nuxt.config.ts` defaults `public.metaPixelId` to
 *    `''`, so an environment that never set `NUXT_PUBLIC_META_PIXEL_ID`
 *    (staging, by design, or a developer's own machine) gets nothing.
 * 2. **Production's real id, wrong hostname.** The hard invariant: even if a
 *    future deploy script or config edit ever carried the real id into a
 *    non-production build by mistake, that one specific id still never fires
 *    from anywhere but `evakuators.am`.
 */
export function shouldLoadPixel(id: string | undefined, hostname: string): boolean {
  if (!id) return false
  if (id === PRODUCTION_PIXEL_ID && hostname !== PRODUCTION_HOSTNAME) return false
  return true
}
