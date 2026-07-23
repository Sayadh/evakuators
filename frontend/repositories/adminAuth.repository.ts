import { apiFetch } from './apiClient'

export interface AdminSession {
  token: string
}

export const adminAuthRepository = {
  login(email: string, password: string): Promise<AdminSession> {
    return apiFetch<AdminSession>('/admin-auth/login', {
      method: 'POST',
      body: { email, password },
    })
  },
}
