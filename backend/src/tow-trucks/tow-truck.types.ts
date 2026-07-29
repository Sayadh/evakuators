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
  /** Page offset — only used by consumers that must walk past the list cap */
  offset?: number
}

/**
 * What a listing card actually renders, and nothing else.
 *
 * The list endpoints used to return the full `TowTruckApi` for every truck,
 * which meant one unauthenticated `GET /tow-trucks` handed out **every driver's
 * secondary phone, WhatsApp, Telegram and email address** — the whole contact
 * database of the platform, in one request, to anyone. It also shipped their
 * plate number, platform dimensions, full price list, description and every
 * photo URL, none of which a card displays.
 *
 * So the list and the detail endpoints now return deliberately different
 * shapes. `whatsapp` stays because the card has a WhatsApp button; `telegram`
 * and `email` do not, because it doesn't. The profile page
 * (`GET /tow-trucks/:slug`) still returns everything — one truck at a time, for
 * someone actually looking at that truck.
 */
export interface TowTruckCardApi {
  id: number
  slug: string
  driverName: string
  companyName?: string
  /** Main phone only — `secondaryPhone` is a profile-page detail */
  phone: string
  whatsapp?: string
  works24Hours: boolean
  workingHours?: string
  startingPrice?: number
  vehicle: {
    brand: string
    model: string
    type: string
    capacityTons: number
    /** Needed by the public filter sidebar */
    manipulator: boolean
  }
  services: string[]
  serviceAreas: ServiceAreaJson[]
  location: {
    regionSlug?: string
    citySlug?: string
    districtSlug?: string
    name: string
  }
  /** At most one — the card shows a single thumbnail */
  images: string[]
  updatedAt: string
}

/**
 * The absolute minimum needed to compute "how many tow trucks serve X" for every
 * region, city and Yerevan district — served by `GET /tow-trucks/coverage`.
 *
 * Why per-truck records rather than ready-made counts: the backend has no
 * geography data (see CLAUDE.md), so it cannot know which cities belong to which
 * marz, and a region's count is a count of DISTINCT trucks — summing its cities'
 * counts would multiply every driver who covers several cities in their own
 * marz. The frontend has the mapping and does the distinct counting; this
 * endpoint just gives it the smallest possible input to do it with.
 *
 * ~70 bytes per truck versus ~1.5 KB for a full listing row, and it carries no
 * contact details at all — the geography pages that need counts no longer
 * download the fleet's phone numbers to render "3 էվակուատոր".
 */
export interface TowTruckCoverageApi {
  /**
   * Same nesting as `TowTruckCardApi.location` on purpose: the frontend's
   * `servesCity` / `servesDistrict` / `servesRegion` matchers then work
   * unchanged on both a coverage record and a full card, instead of needing a
   * second copy of the same predicates for a flatter shape.
   */
  location: {
    regionSlug?: string
    citySlug?: string
    districtSlug?: string
  }
  /** serviceAreas with display names stripped — only slug + type matter for counting */
  serviceAreas: { slug: string; type: ServiceAreaJson['type'] }[]
  works24Hours: boolean
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
  /** Computed display string — HOURS_24 when works24Hours, else workingHoursText, else unset */
  workingHours?: string
  /** Raw driver-entered value (dashboard edit form needs this, not the computed one above) */
  workingHoursText?: string
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
    wheelSkates: boolean
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
  imageDetails?: { id: number; url: string }[]
  /** ISO datetime — used by the frontend's sitemap route for an honest <lastmod> */
  updatedAt: string
}

export type TowTruckWhere = Prisma.TowTruckWhereInput
