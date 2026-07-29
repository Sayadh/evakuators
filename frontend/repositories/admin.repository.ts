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
  platformDimensions?: string
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
  description?: string
  /** Resolved Armenian names — the backend has no geography data of its own */
  serviceAreas: { slug: string; name: string; type: 'city' | 'district' }[]
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
  hasTelegramLinked: boolean
  createdAt: string
  images: { id: number; url: string }[]
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

  /** Permanent — deletes the truck, its images (DB + Supabase Storage), reviews and OTPs */
  deleteTowTruck(id: number): Promise<{ id: number }> {
    return apiFetch<{ id: number }>(`/admin/tow-trucks/${id}`, {
      method: 'DELETE',
      headers: authHeader(),
    })
  },
}
