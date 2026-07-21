import { apiFetch } from './apiClient'

/** Mirrors the backend CreateRegistrationDto */
export interface RegistrationPayload {
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
  imageIds: number[]
}

export interface RegistrationResult {
  id: number
  status: string
}

export const registrationRepository = {
  submit(payload: RegistrationPayload): Promise<RegistrationResult> {
    return apiFetch<RegistrationResult>('/registrations', {
      method: 'POST',
      body: payload as unknown as Record<string, unknown>,
    })
  },
}
