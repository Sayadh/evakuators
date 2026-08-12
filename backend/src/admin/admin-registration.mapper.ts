import { decimalToNumber } from '../common/coordinates'
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
}

export function toAdminRegistrationSummary(
  request: RegistrationWithImages,
): AdminRegistrationSummary {
  return {
    ...request,
    latitude: decimalToNumber(request.latitude),
    longitude: decimalToNumber(request.longitude),
  }
}
