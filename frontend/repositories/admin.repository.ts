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
  capacityRange?: string
  platformDimensions?: string
  winch: boolean
  manipulator: boolean
  works24Hours: boolean
  mainRegionSlug: string
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
  description?: string
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

/** nginx protects every /admin route with HTTP Basic Auth — attach it here */
function authHeader(): Record<string, string> {
  return useAdminAuthStore().authHeader
}

/** All moderation reads/writes against the backend admin endpoints */
export const adminRepository = {
  listRegistrations(status?: string): Promise<AdminRegistrationRequest[]> {
    return apiFetch<AdminRegistrationRequest[]>('/admin/registration-requests', {
      query: status ? { status } : undefined,
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

  listPendingReviews(): Promise<AdminReview[]> {
    return apiFetch<AdminReview[]>('/admin/reviews', { headers: authHeader() })
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
}
