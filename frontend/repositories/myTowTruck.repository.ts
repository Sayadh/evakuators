import { apiFetch } from './apiClient'
import { useDriverAuthStore } from '~/stores/driverAuth'
import type { TowTruck } from '~/types/towTruck'

/** Fields a logged-in driver may edit about their own listing (mirrors backend DTO) */
export interface UpdateMyTowTruckPayload {
  secondaryPhone?: string
  whatsapp?: string
  telegram?: string
  email?: string
  works24Hours?: boolean
  description?: string
  services?: string[]
  priceCityCallout?: number
  pricePerKm?: number
  priceWaitingPerHour?: number
  priceNightSurchargePercent?: number
  priceExtraLoading?: number
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
}
