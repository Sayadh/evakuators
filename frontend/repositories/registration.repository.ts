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
  capacityRange: string
  /** Two numbers, not a formatted string — see PlatformDimensionsInput.vue */
  platformLengthM?: number
  platformWidthM?: number
  winch: boolean
  manipulator: boolean
  wheelSkates: boolean
  workingHoursText?: string
  /** Up to 2 marzes — see backend CreateRegistrationDto */
  regionSlugs: string[]
  citySlugs: string[]
  services: string[]
  /**
   * Base parking coordinates — required, unlike most of this payload.
   *
   * Two numbers, never the "40.1792, 44.4991" string the driver typed: the
   * form parses it with `parseCoordinates` before building this payload, the
   * same way the platform dimensions stopped being a formatted string. See
   * `utils/coordinates.ts`.
   */
  latitude: number
  longitude: number
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
