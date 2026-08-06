import { apiFetch } from './apiClient'

export interface DriverSession {
  token: string
  towTruckId: number
  slug: string
  /**
   * True while the password just used is still the one the system generated
   * and sent over Telegram. The dashboard blocks on it until it is cleared —
   * see `ChangePasswordDialog.vue`.
   */
  mustChangePassword: boolean
}

/**
 * Driver login: phone + password, one step.
 *
 * Replaced a two-step Telegram OTP flow. Telegram still delivers the FIRST
 * password (once, when the driver taps their link) and the contact notices,
 * but it is no longer in the path of every login — see
 * `docs/auth-and-security.md`.
 */
export const driverAuthRepository = {
  login(phone: string, password: string): Promise<DriverSession> {
    return apiFetch<DriverSession>('/driver-auth/login', {
      method: 'POST',
      body: { phone, password },
    })
  },

  /**
   * Lives on `/my/tow-truck`, not `/driver-auth`, because it is an
   * authenticated action on the caller's own profile — the backend takes the
   * truck from the session token, so there is nothing to identify here.
   *
   * Answers 204 with no body — hence `apiFetch<null>` and a `void` return: the
   * generic describes what comes back on the wire (nothing), the signature
   * describes what a caller should do with it (also nothing).
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch<null>('/my/tow-truck/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    })
  },
}
