import { apiFetch } from './apiClient'
import { useDriverAuthStore } from '~/stores/driverAuth'
import type { TowTruck } from '~/types/towTruck'

/** Fields a logged-in driver may edit about their own listing (mirrors backend DTO) */
/**
 * Mirrors the backend `UpdateMyTowTruckDto`. Everything is optional: this is a
 * PATCH and an omitted key means "leave it alone".
 *
 * `slug` and the main `phone` are deliberately absent — they stay admin-only
 * (public URL, and the login key). See the DTO for the full reasoning.
 */
export interface UpdateMyTowTruckPayload {
  driverName?: string
  /** Empty string clears it — the one field where "" differs from omitted */
  companyName?: string
  secondaryPhone?: string
  whatsapp?: string
  telegram?: string
  email?: string

  vehicleBrand?: string
  vehicleModel?: string
  vehicleYear?: number
  vehicleType?: string
  /** Exact float, converted from a picked band by representativeCapacityTons() */
  capacityTons?: number
  platformLengthM?: number
  platformWidthM?: number
  winch?: boolean
  manipulator?: boolean
  wheelSkates?: boolean

  description?: string
  services?: string[]
  /** Validated "HH:MM – HH:MM"; omit entirely when 24/7 or unset */
  workingHoursText?: string

  locationName?: string
  /** Full replacement list, with Armenian names already resolved by the client */
  serviceAreas?: { slug: string; name: string; type: 'city' | 'district' }[]
  /** Structural placement derived from the first service area — sent together with it */
  regionSlug?: string
  citySlug?: string
  districtSlug?: string

  priceCityCallout?: number
  pricePerKm?: number
  priceWaitingPerHour?: number
  priceNightSurchargePercent?: number
  priceExtraLoading?: number
  /** Full replacement list, 1-6 ids, in gallery order — omit to leave photos untouched */
  imageIds?: number[]
}

/** Driver self-service — always operates on the caller's own profile (JWT-scoped) */
export const myTowTruckRepository = {
  getMine(): Promise<TowTruck> {
    return apiFetch<TowTruck>('/my/tow-truck', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  updateMine(payload: UpdateMyTowTruckPayload): Promise<TowTruck> {
    return apiFetch<TowTruck>('/my/tow-truck', {
      method: 'PATCH',
      body: payload as unknown as Record<string, unknown>,
      headers: useDriverAuthStore().authHeader,
    })
  },

  /**
   * Base parking coordinates, saved on their own rather than through
   * `updateMine`.
   *
   * The dashboard edits them in a dialog with its own Save button, so this
   * request carries the two fields that dialog collected and nothing else — it
   * cannot pick up whatever half-finished state the big profile form happens to
   * be holding. The backend's DTO has exactly these two fields for the same
   * reason (see backend `SetCoordinatesDto`).
   *
   * Returns the full refreshed profile, so the caller can re-render from the
   * response instead of guessing what was stored.
   */
  updateCoordinates(latitude: number, longitude: number): Promise<TowTruck> {
    return apiFetch<TowTruck>('/my/tow-truck/coordinates', {
      method: 'PATCH',
      body: { latitude, longitude },
      headers: useDriverAuthStore().authHeader,
    })
  },
}
