/**
 * Cookie NAMES this site's third-party trackers are known to set:
 *
 * - `_ga`, `_gid` — GA4's own visitor/session identifiers.
 * - `_ga_*` — GA4's per-measurement-id cookie (`_ga_G-HEN3RVMTRG`-shaped);
 *   a pattern, not a fixed name, because the suffix is the property id.
 * - `_fbp`, `_fbc` — the Meta Pixel's browser and click identifiers.
 *
 * Pulled out as its own pure predicate — used by `clearAnalyticsCookies`
 * below — so the exact set of names this site treats as "third-party
 * analytics" has a direct test, the same reason `isAdminRoute`/
 * `shouldLoadGtag` are their own functions (`docs/testing.md`: no runtime
 * here to exercise `document.cookie` through).
 */
const ANALYTICS_COOKIE_NAME_PATTERNS: RegExp[] = [/^_ga$/, /^_ga_/, /^_gid$/, /^_fbp$/, /^_fbc$/]

export function isAnalyticsCookieName(name: string): boolean {
  return ANALYTICS_COOKIE_NAME_PATTERNS.some((pattern) => pattern.test(name))
}

/**
 * Deletes every cookie GA4/Ads or the Meta Pixel may have already set,
 * called from `stores/cookieConsent.ts`'s `reject()` — on a first-time
 * refusal AND on revoking a previously given consent, since both go through
 * that same action (see the store's own comment on `revisit()`).
 *
 * This clears cookies; it cannot un-set anything a first-party server
 * already recorded from a beacon sent before the refusal — there is none
 * here, since neither tracker requests anything before `status ===
 * 'accepted'` (`plugins/gtag-gate.client.ts`, `plugins/meta-pixel.client.ts`).
 *
 * Written twice per cookie, deliberately: once with no `domain` (covers a
 * cookie set on the exact host, `path=/` default) and once with
 * `domain=.<hostname>` (covers one set on the parent domain, which is how
 * gtag.js/fbevents.js write theirs on a real deployment). A `Set-Cookie`
 * expiry only clears a cookie whose `domain`/`path` MATCH what deleted it —
 * writing only one of the two shapes here would silently leave the other
 * kind behind.
 */
export function clearAnalyticsCookies(): void {
  if (!import.meta.client) return

  const names = document.cookie
    .split(';')
    .map((pair) => pair.split('=')[0]?.trim())
    .filter((name): name is string => !!name && isAnalyticsCookieName(name))

  for (const name of names) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`
  }
}
