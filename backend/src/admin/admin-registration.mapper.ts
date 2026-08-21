import type { DriverPrivacyConsent } from '@prisma/client'
import { decimalToNumber } from '../common/coordinates'
import { toAdminConsentSummary, type AdminConsentSummary } from '../privacy-consent/privacy-consent.service'
import type { RegistrationWithImages } from '../registration/registration.repository'

/**
 * A pending registration as the moderation queue receives it.
 *
 * Almost the raw Prisma row — this is an internal, admin-authenticated list and
 * there is nothing on a registration request an admin should not see. The one
 * change is the coordinate pair.
 *
 * ## Why the two Decimals cannot be passed through
 *
 * `latitude`/`longitude` are `Decimal(9,6)` columns, so Prisma hands back
 * decimal.js instances. Those serialise through their own `toJSON()`, which
 * returns a **string** — so a client that declared them as `number` would be
 * quietly wrong, and `typeof latitude === 'number'` would be false for every
 * request that actually has a location. The list got away with it only because
 * nothing read them until the approval dialog started showing whether a driver
 * had sent a marker at all.
 *
 * `decimalToNumber` also collapses `null` to `undefined`, which is what the
 * rest of the API does for "not set" (see `AdminTowTruckSummary.latitude`), so
 * the two admin shapes answer the question the same way.
 */
export type AdminRegistrationSummary = Omit<
  RegistrationWithImages,
  'latitude' | 'longitude'
> & {
  latitude?: number
  longitude?: number
  /**
   * Whether — and when — this driver ticked the privacy-consent checkbox.
   *
   * Read straight off the row `PrivacyConsentService.acceptForRegistration`
   * writes at submission time, so this is not inferred from anything else on
   * the request. `null` covers two cases the admin panel does not need to
   * tell apart: a request filed before the consent dialog existed, and one
   * that has already been decided (`approve()` re-points the row at the new
   * TowTruck and clears `registrationRequestId` — see
   * `PrivacyConsentRepository.attachRegistrationConsentToTruck` — so a
   * PENDING request is the only reliable place to read this from).
   */
  privacyConsent: AdminConsentSummary | null
}

type RegistrationRow = RegistrationWithImages & {
  privacyConsents: Pick<DriverPrivacyConsent, 'policyVersion' | 'acceptedAt' | 'revokedAt'>[]
}

export function toAdminRegistrationSummary(request: RegistrationRow): AdminRegistrationSummary {
  const { privacyConsents, ...rest } = request

  return {
    ...rest,
    latitude: decimalToNumber(request.latitude),
    longitude: decimalToNumber(request.longitude),
    privacyConsent: toAdminConsentSummary(privacyConsents[0]),
  }
}
