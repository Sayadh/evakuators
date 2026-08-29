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

  vehicleBrand?: string
  vehicleModel?: string
  vehicleYear?: number
  vehicleType?: string
  /** Exact float, converted from a picked band by representativeCapacityTons() */
  capacityTons?: number
  platformLengthM?: number
  platformWidthM?: number
  /** The specialist technical answers — see SPECIALIST_SPEC_FIELDS */
  craneCapacityTons?: number
  craneReachM?: number
  maxLoadTons?: number
  platformLoadHeightCm?: number
  winch?: boolean
  manipulator?: boolean
  wheelSkates?: boolean
  doubleDeck?: boolean
  towHitch?: boolean
  /**
   * «Ծանր տեխնիկայի տեղափոխում», proposed by the driver.
   *
   * A save queues a diff rather than writing, so this is a request a moderator
   * approves — which is what lets the field be driver-editable at all without
   * reopening the self-promotion hole `TowTruck.heavyEquipment` was made
   * admin-only to close.
   */
  heavyEquipment?: boolean
  /** «Ամբողջ Հայաստան» — see `TowTruck.servesAllArmenia` */
  servesAllArmenia?: boolean

  description?: string
  services?: string[]
  /** Validated "HH:MM – HH:MM"; omit entirely when 24/7 or unset */
  workingHoursText?: string

  locationName?: string
  /** Full replacement list, with Armenian names already resolved by the client */
  serviceAreas?: {
    slug: string
    name: string
    /** `region` only ever comes from an uncapped driver — see ServiceAreaDto */
    type: 'city' | 'district' | 'route' | 'region'
  }[]
  /**
   * The marzes the driver ticked — sent for the coverage cap only, never
   * stored. It is what lets the backend apply 3-for-one-marz instead of the
   * looser 5, which typed areas alone cannot express (see
   * `constants/serviceAreaLimits.ts`).
   */
  regionSlugs?: string[]
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

/** One field that differs between the live profile and a queued edit */
export interface ProfileChangeField {
  field: string
  before: unknown
  after: unknown
}

/**
 * What the dashboard needs to know about the moderation queue.
 *
 * Two mutually exclusive halves, mirroring backend `DriverProfileChangeStatusApi`:
 * something is waiting, or the last thing that was waiting got a verdict.
 * Never both — a driver who has resubmitted is looking at the new attempt, and
 * showing the previous refusal beside it would read as a verdict on it.
 */
export interface DriverProfileChangeStatus {
  pending: { id: number; fields: ProfileChangeField[]; createdAt: string } | null
  lastReviewed: {
    id: number
    status: 'APPROVED' | 'REJECTED'
    rejectionReason?: string
    reviewedAt?: string
  } | null
}

/** Driver self-service — always operates on the caller's own profile (JWT-scoped) */
export const myTowTruckRepository = {
  getMine(): Promise<TowTruck> {
    return apiFetch<TowTruck>('/my/tow-truck', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  /**
   * Submits the profile form **for review**. It does not save.
   *
   * Every field a driver can change is moderated, so this queues a diff and the
   * live listing is untouched until an admin approves — which is why it answers
   * with the queue status rather than the profile. Returning `TowTruck` here
   * was the old shape and would now be actively misleading: it would be the
   * profile as it still is, right after telling the driver their save
   * succeeded.
   *
   * `pending: null` means nothing differed. The form submits every field
   * whether or not it was touched, so that is a normal outcome, not an error.
   */
  updateMine(payload: UpdateMyTowTruckPayload): Promise<DriverProfileChangeStatus> {
    return apiFetch<DriverProfileChangeStatus>('/my/tow-truck', {
      method: 'PATCH',
      body: payload as unknown as Record<string, unknown>,
      headers: useDriverAuthStore().authHeader,
    })
  },

  /** What is queued for this driver, or why the last attempt was refused */
  getProfileChange(): Promise<DriverProfileChangeStatus> {
    return apiFetch<DriverProfileChangeStatus>('/my/tow-truck/profile-change', {
      headers: useDriverAuthStore().authHeader,
    })
  },

  /** Withdraws the queued edit — nothing was applied, so it simply disappears */
  withdrawProfileChange(): Promise<{ withdrawn: boolean }> {
    return apiFetch<{ withdrawn: boolean }>('/my/tow-truck/profile-change', {
      method: 'DELETE',
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
   * Moderated like every other field: this queues, it does not write. A base
   * location is as public a claim as a service area, and leaving it
   * self-service would make it the obvious way around the review — so the
   * response is the queue status, not a refreshed profile.
   */
  updateCoordinates(latitude: number, longitude: number): Promise<DriverProfileChangeStatus> {
    return apiFetch<DriverProfileChangeStatus>('/my/tow-truck/coordinates', {
      method: 'PATCH',
      body: { latitude, longitude },
      headers: useDriverAuthStore().authHeader,
    })
  },
}
