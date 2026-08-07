import { apiFetch } from './apiClient'
import { useAdminAuthStore } from '~/stores/adminAuth'

/** Mirrors backend RegistrationWithImages (RegistrationRequest & images) */
export interface AdminRegistrationRequest {
  id: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  firstName: string
  lastName: string
  companyName?: string
  phone: string
  secondaryPhone?: string
  whatsapp?: string
  telegram?: string
  email?: string
  vehicleBrand: string
  vehicleModel?: string
  vehicleYear: number
  vehicleType: string
  capacityRange: string
  platformLengthM?: number
  platformWidthM?: number
  winch: boolean
  manipulator: boolean
  wheelSkates: boolean
  workingHoursText?: string
  /** Up to 2 marzes the driver picked at registration */
  regionSlugs: string[]
  citySlugs: string[]
  services: string[]
  priceCityCallout?: number
  pricePerKm?: number
  priceWaitingPerHour?: number
  priceNightSurchargePercent?: number
  priceExtraLoading?: number
  createdAt: string
  images: { id: number; url: string }[]
}

/** Mirrors backend ApproveRegistrationDto */
export interface ApproveRegistrationPayload {
  slug: string
  capacityTons: number
  locationName: string
  citySlug?: string
  districtSlug?: string
  /**
   * The truck's "best-effort" browsing region (TowTruck.regionSlug) —
   * resolved here (not on the backend, which has no geography data) from
   * whichever region citySlug/districtSlug actually belongs to. Omitted for
   * Yerevan, same as before.
   */
  regionSlug?: string
  /**
   * The marzes from the original request — sent for the coverage cap only,
   * never stored. Distinct from `regionSlug` above, which is the single stored
   * browsing region. See `constants/serviceAreaLimits.ts`.
   */
  regionSlugs?: string[]
  description?: string
  /** Resolved Armenian names — the backend has no geography data of its own */
  serviceAreas: { slug: string; name: string; type: 'city' | 'district' | 'route' }[]
}

/** Mirrors backend ReviewWithTruck */
export interface AdminReview {
  id: number
  towTruckId: number
  authorName: string
  rating: number
  text: string
  cityName?: string
  isApproved: boolean
  createdAt: string
  towTruck: { slug: string; driverName: string }
}

/** Mirrors backend AdminTowTruckSummary */
export interface AdminTowTruck {
  id: number
  slug: string
  driverName: string
  companyName?: string
  phone: string
  isActive: boolean
  /** Admin-curated "best tow trucks" homepage pick */
  isFeatured: boolean
  vehicleBrand: string
  vehicleModel?: string
  vehicleYear: number
  locationName: string
  /**
   * Base parking coordinates. Both undefined for every driver approved before
   * this field existed — which is what the panel renders as
   * «Տեղադիրքը նշված չէ».
   *
   * Present here and not on any public shape: this endpoint is behind
   * `AdminJwtGuard`. See `TowTruckApi.location` on the backend.
   */
  latitude?: number
  longitude?: number
  /** ISO datetime of the last coordinate write; undefined when never set */
  locationUpdatedAt?: string
  hasTelegramLinked: boolean
  createdAt: string
  images: { id: number; url: string }[]
}

/** Mirrors the backend's `GET /admin/tow-trucks/count` — `inactive` is `total - active` */
export interface AdminTowTruckCounts {
  total: number
  active: number
  inactive: number
}

/**
 * One driver who could be handed a password right now: Telegram linked, no
 * password of their own yet. No `telegramChatId` — it is a BigInt the API
 * cannot serialise, and being on this list already means "linked".
 */
export interface PasswordCandidate {
  id: number
  slug: string
  driverName: string
  phone: string
}

export interface IssuePasswordsResult {
  issued: number
  failed: Array<{ id: number; slug: string }>
  /** Named in the request but no longer eligible — the list can go stale between load and send */
  skipped: number
}

/** Every /admin/* route requires a valid admin JWT — attach it here */
function authHeader(): Record<string, string> {
  return useAdminAuthStore().authHeader
}

/**
 * Paging for the admin listings. These are the tables that grow forever —
 * registration requests are kept as an audit trail and nothing deletes them —
 * so the panel loads a page at a time and offers "load more" rather than
 * fetching every row it has ever accumulated on each visit.
 */
export interface AdminListParams {
  limit?: number
  offset?: number
}

/** All moderation reads/writes against the backend admin endpoints */
export const adminRepository = {
  listRegistrations(
    status?: string,
    params: AdminListParams = {},
  ): Promise<AdminRegistrationRequest[]> {
    return apiFetch<AdminRegistrationRequest[]>('/admin/registration-requests', {
      query: { ...(status ? { status } : {}), limit: params.limit, offset: params.offset },
      headers: authHeader(),
    })
  },

  approveRegistration(
    id: number,
    payload: ApproveRegistrationPayload,
  ): Promise<{ towTruckId: number; telegramLinkUrl: string }> {
    return apiFetch<{ towTruckId: number; telegramLinkUrl: string }>(
      `/admin/registration-requests/${id}/approve`,
      { method: 'POST', body: payload as unknown as Record<string, unknown>, headers: authHeader() },
    )
  },

  /** (Re)generate the Telegram-login link, e.g. if the driver lost the first one */
  regenerateTelegramLink(towTruckId: number): Promise<{ telegramLinkUrl: string }> {
    return apiFetch<{ telegramLinkUrl: string }>(`/admin/tow-trucks/${towTruckId}/telegram-link`, {
      method: 'POST',
      headers: authHeader(),
    })
  },

  /**
   * The drivers who could be handed a password right now — linked Telegram, no
   * password yet. Read-only: the panel lists these with checkboxes so an admin
   * chooses recipients before anything leaves the system.
   */
  listPasswordCandidates(): Promise<PasswordCandidate[]> {
    return apiFetch<PasswordCandidate[]>('/admin/tow-trucks/password-candidates', {
      headers: authHeader(),
    })
  },

  /**
   * Sends a temporary password to exactly the drivers named, over Telegram.
   *
   * Always takes an explicit id list — there is no "send to everyone" call,
   * deliberately, because a Telegram message cannot be unsent. The backend
   * re-checks eligibility and counts anything stale as `skipped`.
   */
  issuePasswords(towTruckIds: number[]): Promise<IssuePasswordsResult> {
    return apiFetch<IssuePasswordsResult>('/admin/tow-trucks/issue-passwords', {
      method: 'POST',
      body: { towTruckIds },
      headers: authHeader(),
    })
  },

  rejectRegistration(id: number): Promise<{ id: number; status: string }> {
    return apiFetch<{ id: number; status: string }>(
      `/admin/registration-requests/${id}/reject`,
      { method: 'POST', headers: authHeader() },
    )
  },

  listPendingReviews(params: AdminListParams = {}): Promise<AdminReview[]> {
    return apiFetch<AdminReview[]>('/admin/reviews', {
      query: { limit: params.limit, offset: params.offset },
      headers: authHeader(),
    })
  },

  approveReview(id: number): Promise<{ id: number; isApproved: boolean }> {
    return apiFetch<{ id: number; isApproved: boolean }>(`/admin/reviews/${id}/approve`, {
      method: 'POST',
      headers: authHeader(),
    })
  },

  rejectReview(id: number): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/admin/reviews/${id}/reject`, {
      method: 'POST',
      headers: authHeader(),
    })
  },

  listTowTrucks(params: AdminListParams = {}): Promise<AdminTowTruck[]> {
    return apiFetch<AdminTowTruck[]>('/admin/tow-trucks', {
      query: { limit: params.limit, offset: params.offset },
      headers: authHeader(),
    })
  },

  /**
   * Totals across every page. `listTowTrucks` is paginated, so the length of
   * what it returned answers "how many are loaded", never "how many exist".
   */
  getTowTruckCounts(): Promise<AdminTowTruckCounts> {
    return apiFetch<AdminTowTruckCounts>('/admin/tow-trucks/count', {
      headers: authHeader(),
    })
  },

  /** Deactivate (isActive: false) hides the truck publicly and blocks driver login — reversible */
  setTowTruckActive(id: number, isActive: boolean): Promise<{ id: number; isActive: boolean }> {
    return apiFetch<{ id: number; isActive: boolean }>(`/admin/tow-trucks/${id}/active`, {
      method: 'PATCH',
      body: { isActive },
      headers: authHeader(),
    })
  },

  /** Toggle whether this truck shows in the homepage "best tow trucks" section */
  setTowTruckFeatured(id: number, isFeatured: boolean): Promise<{ id: number; isFeatured: boolean }> {
    return apiFetch<{ id: number; isFeatured: boolean }>(`/admin/tow-trucks/${id}/featured`, {
      method: 'PATCH',
      body: { isFeatured },
      headers: authHeader(),
    })
  },

  /**
   * Corrects the main login phone (the driver's own dashboard can't edit this
   * field). Backend rejects it if another active truck already uses it.
   */
  setTowTruckPhone(id: number, phone: string): Promise<{ id: number; phone: string }> {
    return apiFetch<{ id: number; phone: string }>(`/admin/tow-trucks/${id}/phone`, {
      method: 'PATCH',
      body: { phone },
      headers: authHeader(),
    })
  },

  /**
   * Sets or corrects a truck's base parking coordinates.
   *
   * Unlike `setTowTruckPhone`, this is not an admin-only field — the driver can
   * edit it from their own dashboard too. This endpoint exists so support can
   * fix a pair pasted in the wrong order without asking them to log in.
   */
  setTowTruckCoordinates(
    id: number,
    latitude: number,
    longitude: number,
  ): Promise<{ id: number; latitude: number; longitude: number; locationUpdatedAt: string }> {
    return apiFetch<{ id: number; latitude: number; longitude: number; locationUpdatedAt: string }>(
      `/admin/tow-trucks/${id}/coordinates`,
      { method: 'PATCH', body: { latitude, longitude }, headers: authHeader() },
    )
  },

  /** Permanent — deletes the truck, its images (DB + Supabase Storage), reviews and OTPs */
  deleteTowTruck(id: number): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/admin/tow-trucks/${id}`, {
      method: 'DELETE',
      headers: authHeader(),
    })
  },
}
