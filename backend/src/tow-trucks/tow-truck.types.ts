import type { Prisma, TowTruck, TowTruckImage } from '@prisma/client'

export type TowTruckWithImages = TowTruck & { images: TowTruckImage[] }

export interface TowTruckFilters {
  citySlug?: string
  districtSlug?: string
  regionSlug?: string
  /** Extra city slugs of a region (static data lives in the frontend) */
  regionCitySlugs?: string[]
  /** Any Yerevan-related truck (based in a district or serving one) */
  yerevan?: boolean
  limit?: number
}

export interface ServiceAreaJson {
  name: string
  slug: string
  type: 'city' | 'district' | 'region'
}

/** API shape — mirrors the frontend `TowTruck` interface exactly */
export interface TowTruckApi {
  id: number
  slug: string
  driverName: string
  companyName?: string
  phone: string
  secondaryPhone?: string
  whatsapp?: string
  telegram?: string
  email?: string
  works24Hours: boolean
  workingHours: string
  startingPrice?: number
  description: string
  vehicle: {
    brand: string
    model: string
    year: number
    type: string
    capacityTons: number
    platformLengthM?: number
    platformWidthM?: number
    winch: boolean
    manipulator: boolean
    plateNumber?: string
    showPlateNumber: boolean
  }
  services: string[]
  serviceAreas: ServiceAreaJson[]
  location: {
    regionSlug?: string
    citySlug?: string
    districtSlug?: string
    name: string
  }
  pricing?: {
    cityCallout?: number
    perKm?: number
    waitingPerHour?: number
    nightSurchargePercent?: number
    extraLoading?: number
  }
  images: string[]
  /** ISO datetime — used by the frontend's sitemap route for an honest <lastmod> */
  updatedAt: string
}

export type TowTruckWhere = Prisma.TowTruckWhereInput
