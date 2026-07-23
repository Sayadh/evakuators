import { apiFetch } from './apiClient'

export interface DriverSession {
  token: string
  towTruckId: number
  slug: string
}

/** Two-step Telegram OTP login for drivers (see backend driver-auth module) */
export const driverAuthRepository = {
  requestCode(phone: string): Promise<{ sent: true }> {
    return apiFetch<{ sent: true }>('/driver-auth/request-code', {
      method: 'POST',
      body: { phone },
    })
  },

  verifyCode(phone: string, code: string): Promise<DriverSession> {
    return apiFetch<DriverSession>('/driver-auth/verify-code', {
      method: 'POST',
      body: { phone, code },
    })
  },
}
