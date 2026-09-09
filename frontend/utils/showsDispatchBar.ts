/**
 * Whether the mobile sticky «Զանգահարել մեզ» bar belongs on this path.
 *
 * ## Why a predicate and not a `<DispatchCallCta variant="bar">` per page
 *
 * The bar is rendered once, in `layouts/default.vue`, so the rule for where it
 * appears is stated once too. Dropped into each page's template instead, the
 * rule would exist only as the set of files somebody remembered to edit — and
 * the failure mode is silent in the worst direction: a page that grows a
 * listing later simply never gets the bar, and nobody notices a button that
 * isn't there.
 *
 * Pure, so it has a direct test rather than only being reachable by mounting a
 * layout — same reasoning as `isAdminRoute`.
 *
 * ## Allowlist, deliberately, not a blocklist
 *
 * A blocklist gets this wrong the first time a route is added. «Զանգահարեք
 * մեզ» is aimed at a stranded customer; on `/admin/*`, `/dashboard`,
 * `/register` or `/login` the person reading is a driver or the operator
 * himself, and a permanent strip telling them to phone the office is at best
 * noise and at worst confusing in the admin panel. With an allowlist a new
 * route shows no bar until someone decides it should.
 *
 * ## What is intentionally NOT here
 *
 * - `/` — the homepage hero already carries the same call, in the first
 *   viewport. A sticky bar on top of it would be the same offer twice.
 * - `/tow-trucks/*` — the driver profile has its own sticky bar with THAT
 *   driver's number. Two fixed bars would stack, and the operator's number
 *   would be competing with the driver's on the driver's own page, which is
 *   exactly the thing the subscription is sold as not doing.
 * - `/free-routes`, `/evakuator`, `/manipulator/*`, `/tsanr-tehnika/*` — these
 *   are listings too and may well earn the bar, but they are a separate
 *   decision from "the geography pages", and adding them here without the
 *   in-page banner would leave them with the loud half and not the quiet one.
 */
const EXACT = new Set(['/regions', '/yerevan'])

export function showsDispatchBar(path: string): boolean {
  // Trailing slash is not a different page; Nuxt will serve both.
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

  if (EXACT.has(normalized)) return true

  // `/regions/<region>` and `/regions/<region>/<city>`, `/yerevan/<district>`.
  // Depth-bounded rather than a bare `startsWith`, so a future
  // `/regions/<region>/<city>/<something-else>` has to be considered rather
  // than inheriting the bar by accident.
  const segments = normalized.split('/').filter(Boolean)
  if (segments[0] === 'regions') return segments.length === 2 || segments.length === 3
  if (segments[0] === 'yerevan') return segments.length === 2

  return false
}
