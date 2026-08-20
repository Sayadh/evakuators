import { PRIVACY_POLICY_VERSION } from '~/constants/privacyConsent'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { apiFetch } from './apiClient'

export interface PrivacyConsentStatus {
  /** True when there is no live consent at the server's current policy version */
  requiresPrivacyConsent: boolean
  /** The version the server would record — may be newer than ours after a deploy */
  policyVersion: string
  acceptedAt: string | null
}

export interface PrivacyConsentHistoryEntry {
  policyVersion: string
  acceptedAt: string
  revokedAt: string | null
  source: 'REGISTRATION' | 'EXISTING_DRIVER'
}

/**
 * A driver's consent to the processing and publication of their own data.
 *
 * Every route lives under `/my/tow-truck`, so the truck is taken from the
 * session token and **there is no id in any of these payloads** — a driver
 * cannot even express a request to change somebody else's consent. See the
 * backend controller for why that shape was chosen over a body field plus a
 * guard.
 *
 * Note what is NOT sent: no consent text, and no hash of it. The server hashes
 * its own canonical copy, because a hash from the client proves only that the
 * client can run SHA-256 — see `AcceptPrivacyConsentDto`. The version IS sent,
 * precisely so the server can reject it when this tab has been open across a
 * policy change.
 */
export const privacyConsentRepository = {
  /**
   * The authoritative answer, re-read on every dashboard load rather than
   * trusted from the cached session — see `DriverSession.requiresPrivacyConsent`.
   */
  getStatus(): Promise<PrivacyConsentStatus> {
    return apiFetch<PrivacyConsentStatus>('/my/tow-truck/privacy-consent', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  /**
   * Records the consent and returns the new status.
   *
   * Idempotent on the server: a double-tap returns the FIRST acceptance's
   * timestamp rather than writing a second row, so this is safe to retry.
   */
  accept(): Promise<PrivacyConsentStatus> {
    return apiFetch<PrivacyConsentStatus>('/my/tow-truck/privacy-consent', {
      method: 'POST',
      // `accepted: true` is redundant with having called this method at all,
      // and is sent anyway because the server requires it: the flag is the
      // machine-readable form of the ticked box, and an endpoint that accepted
      // an empty body would be one refactor away from consenting by accident.
      body: { policyVersion: PRIVACY_POLICY_VERSION, accepted: true },
      headers: useDriverAuthStore().authHeader,
    })
  },

  /** Withdraws it. The driver's next dashboard load blocks again. */
  revoke(): Promise<{ revoked: number }> {
    return apiFetch<{ revoked: number }>('/my/tow-truck/privacy-consent', {
      method: 'DELETE',
      headers: useDriverAuthStore().authHeader,
    })
  },

  history(): Promise<PrivacyConsentHistoryEntry[]> {
    return apiFetch<PrivacyConsentHistoryEntry[]>('/my/tow-truck/privacy-consent/history', {
      headers: useDriverAuthStore().authHeader,
    })
  },
}
