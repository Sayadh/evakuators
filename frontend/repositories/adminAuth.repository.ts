import { apiFetch } from './apiClient'

export interface AdminSession {
  token: string
}

/**
 * `requiresCode: false` means the account hasn't linked Telegram yet (see
 * backend `npm run admin:telegram-link`) — login is single-factor until
 * then. Once linked, login() always returns `requiresCode: true` and
 * verifyCode() must be called next with the code sent to Telegram.
 */
export type AdminLoginResult =
  | { requiresCode: true; pendingToken: string; expiresInSeconds: number }
  | ({ requiresCode: false } & AdminSession)

export const adminAuthRepository = {
  login(email: string, password: string): Promise<AdminLoginResult> {
    return apiFetch<AdminLoginResult>('/admin-auth/login', {
      method: 'POST',
      body: { email, password },
    })
  },

  /**
   * `pendingToken` comes from login()'s `requiresCode: true` response and
   * replaces the email this used to send. The email identified the account but
   * proved nothing — the password played no part in the second step at all.
   * The token is bound to one specific code challenge and is single-use.
   */
  verifyCode(pendingToken: string, code: string): Promise<AdminSession> {
    return apiFetch<AdminSession>('/admin-auth/verify-code', {
      method: 'POST',
      body: { pendingToken, code },
    })
  },
}
