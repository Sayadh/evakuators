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
export type AdminLoginResult = { requiresCode: true } | ({ requiresCode: false } & AdminSession)

export const adminAuthRepository = {
  login(email: string, password: string): Promise<AdminLoginResult> {
    return apiFetch<AdminLoginResult>('/admin-auth/login', {
      method: 'POST',
      body: { email, password },
    })
  },

  verifyCode(email: string, code: string): Promise<AdminSession> {
    return apiFetch<AdminSession>('/admin-auth/verify-code', {
      method: 'POST',
      body: { email, code },
    })
  },
}
