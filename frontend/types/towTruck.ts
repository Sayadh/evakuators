import type { LocationType, ServiceType, VehicleType } from './enums'

export interface TowTruckVehicle {
  brand: string
  model: string
  year: number
  type: VehicleType
  capacityTons: number
  platformLengthM?: number
  platformWidthM?: number
  winch: boolean
  manipulator: boolean
  plateNumber?: string
  showPlateNumber: boolean
}

/**
 * Pricing is fully optional — drivers fill only what they want.
 * Rows that are undefined are simply not rendered anywhere.
 */
export interface TowTruckPricing {
  /** AMD, callout inside the base city */
  cityCallout?: number
  /** AMD per km for intercity transport */
  perKm?: number
  /** AMD per hour of waiting */
  waitingPerHour?: number
  /** % added for night service */
  nightSurchargePercent?: number
  /** AMD for complicated / extra loading */
  extraLoading?: number
}

export interface ServiceArea {
  name: string
  slug: string
  type: LocationType
}

export interface TowTruckLocation {
  /** Region slug for cities outside Yerevan */
  regionSlug?: string
  citySlug?: string
  /** Yerevan administrative district slug */
  districtSlug?: string
  name: string
}

export interface TowTruck {
  id: number
  slug: string
  driverName: string
  companyName?: string
  /** Main phone — shown on cards and used for the primary call action */
  phone: string
  /** Optional secondary phone — shown only on the profile page */
  secondaryPhone?: string
  whatsapp?: string
  telegram?: string
  email?: string
  works24Hours: boolean
  workingHours: string
  /** Undefined when the driver didn't provide pricing — cards then show no price */
  startingPrice?: number
  description: string
  vehicle: TowTruckVehicle
  services: ServiceType[]
  serviceAreas: ServiceArea[]
  location: TowTruckLocation
  /** Undefined when the driver didn't fill the pricing section */
  pricing?: TowTruckPricing
  images: string[]
  /** ISO datetime — used for an honest sitemap <lastmod> */
  updatedAt: string
}
