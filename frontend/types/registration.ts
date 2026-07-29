import type { ServiceType, VehicleType } from './enums'

export interface RegistrationPersonalData {
  firstName: string
  lastName: string
  companyName: string
  phone: string
  secondaryPhone: string
  whatsapp: string
  telegram: string
  email: string
}

export interface RegistrationVehicleData {
  brand: string
  model: string
  year: number | null
  type: VehicleType | null
  /** Value from CAPACITY_RANGE_OPTIONS (e.g. "2-3.5") */
  capacityRange: string
  /** Optional, metres — collected as two number inputs */
  platformLengthM: string
  platformWidthM: string
  winch: boolean
  manipulator: boolean
  wheelSkates: boolean
}

export interface RegistrationAreasData {
  /** Up to 2 marzes */
  regionSlugs: string[]
  /** Selected cities/districts across the chosen regions ("whole region" = all its city slugs) */
  citySlugs: string[]
}

/**
 * All pricing fields are optional — the profile shows only the filled rows,
 * and nothing at all when the whole section is left empty.
 */
export interface RegistrationPricingData {
  /** AMD */
  cityCallout: string
  /** AMD per km */
  perKm: string
  /** AMD per hour */
  waitingPerHour: string
  /** Percent 1-100 */
  nightSurchargePercent: string
  /** AMD */
  extraLoading: string
}

export interface RegistrationImagesData {
  /** Required */
  mainImage: File | null
  /** Up to 5 images */
  extraImages: File[]
}

export interface RegistrationForm {
  personal: RegistrationPersonalData
  vehicle: RegistrationVehicleData
  areas: RegistrationAreasData
  services: ServiceType[]
  pricing: RegistrationPricingData
  images: RegistrationImagesData
}
