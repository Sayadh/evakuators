/**
 * Server answers on the sign-in and sign-up screens → which message to show.
 *
 * The sign-up FORM itself is no longer here: since 2026-11 the app files the
 * website's registration, so its state, rules and payload are the website's
 * own (`~/utils/registrationForm`, `~/utils/registrationPayload` — see
 * mobile/metro.config.js). The older app-only form that lived in this file
 * asked for a different, smaller profile; keeping two forms was exactly the
 * drift the shared import removes.
 */

/** Server error code → which message to show on the login screen */
export const LOGIN_ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'APP_ACCESS_NOT_GRANTED',
  'APP_ACCOUNT_PENDING',
  'APP_ACCOUNT_REJECTED',
  'APP_ACCESS_SUSPENDED',
] as const

/** Codes `POST /driver-app/site-registrations` answers with (the website's own rules answer with a message only) */
export const REGISTER_ERROR_CODES = ['PHONE_ALREADY_REGISTERED', 'REGISTRATION_ALREADY_PENDING', 'VALIDATION_FAILED', 'RATE_LIMITED'] as const

export function loginErrorKey(status: number | null, code: string | null): string {
  if (status === null) return 'errors.NETWORK'
  if (code && (LOGIN_ERROR_CODES as readonly string[]).includes(code)) return `loginErrors.${code}`
  // The website's own refusals (DriverAuthService) carry no dispatch code
  if (status === 401) return 'loginErrors.INVALID_CREDENTIALS'
  if (status === 403) return 'login.deactivated'
  if (status === 429) return 'loginErrors.RATE_LIMITED'
  return 'errors.UNKNOWN'
}
