/**
 * JWT `aud` values for the two admin tokens.
 *
 * Both are signed with the SAME `ADMIN_JWT_SECRET`, so a valid signature alone
 * does not tell them apart. Without an audience the 5-minute 2FA token —
 * issued before the second factor has been proven — would be accepted by
 * `AdminJwtGuard` as a full 24-hour session, which is the entire second factor
 * bypassed by sending the wrong token to the right endpoint.
 *
 * The check runs in both directions and is done by the JWT library itself
 * (`verify`'s `audience` option), not by a hand-written `if`, so neither side
 * can forget it:
 *
 * - `AdminAuthService.verifyCode()` accepts only `admin:2fa`
 * - `AdminJwtGuard` accepts only `admin:session`
 *
 * They live in their own file rather than in the service so the guard can
 * import them without pulling the service (and its repositories) in with it.
 */
export const ADMIN_SESSION_AUDIENCE = 'admin:session'
export const ADMIN_2FA_AUDIENCE = 'admin:2fa'
