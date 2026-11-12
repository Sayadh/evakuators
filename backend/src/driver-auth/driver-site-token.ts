/**
 * The WEBSITE driver session (POST /driver-auth/login → /my/*).
 *
 * SECURITY (2026-11-12 audit): three kinds of token are signed with the same
 * DRIVER_JWT_SECRET — this one (`sub` = TowTruck id), the driver APP session
 * (`aud` driver:app, `sub` = FleetDriver id) and the wallet pay link
 * (`aud` driver:wallet-pay, `sub` = FleetDriver id). The website guard used to
 * check only the signature, so an app token or a pay link (which travels in a
 * URL) was accepted as a website session for the tow truck whose id happened
 * to equal the FleetDriver id — someone else's profile.
 *
 * Now the website token carries its own audience, and the guard refuses any
 * token that names a different one. Tokens issued before this change have no
 * `aud` at all; they are still accepted until they expire (TOKEN_TTL), so no
 * driver is logged out by the fix.
 */
export const DRIVER_SITE_AUDIENCE = 'driver:site'

/** True when the token's audience allows a website session */
export function isSiteAudience(aud: unknown): boolean {
  if (aud === undefined) return true
  if (typeof aud === 'string') return aud === DRIVER_SITE_AUDIENCE
  return Array.isArray(aud) && aud.length === 1 && aud[0] === DRIVER_SITE_AUDIENCE
}
