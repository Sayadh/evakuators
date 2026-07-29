import type { LocationType, ServiceType, VehicleType } from './enums'

/** Vehicle fields a listing card and the public filters need */
export interface TowTruckCardVehicle {
  brand: string
  model: string
  type: VehicleType
  capacityTons: number
  /** Used by the "manipulator" filter checkbox */
  manipulator: boolean
}

export interface TowTruckVehicle extends TowTruckCardVehicle {
  year: number
  platformLengthM?: number
  platformWidthM?: number
  winch: boolean
  /** Absent when the driver chose not to publish it — the backend withholds it */
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

/**
 * The minimum a geography matcher (`servesCity`, `servesDistrict`,
 * `servesRegion`) needs. Both a full card and a bare coverage record satisfy it,
 * which is why there is one set of predicates rather than one per shape.
 */
export interface TowTruckGeography {
  location: Omit<TowTruckLocation, 'name'>
  serviceAreas: { slug: string; type: LocationType }[]
}

/**
 * `GET /tow-trucks/coverage` — the smallest record that can answer "how many
 * tow trucks serve X" for every region, city and Yerevan district.
 *
 * The browse pages used to download the entire fleet (contacts, descriptions,
 * photo URLs and all) to render "3 էվակուատոր" on a card. This carries ~5% of
 * that and no personal data whatsoever.
 */
export interface TowTruckCoverage extends TowTruckGeography {
  /** Needed for the "of which 24/7" sub-count on city and district cards */
  works24Hours: boolean
}

/**
 * What list endpoints return — mirrors the backend's `TowTruckCardApi`.
 *
 * Deliberately smaller than `TowTruck`. A listing response used to carry every
 * driver's secondary phone, WhatsApp, Telegram and email, so a single
 * unauthenticated `GET /tow-trucks` handed out the platform's entire contact
 * database; it also shipped descriptions, price tables, plate numbers and every
 * photo URL that no card renders. `whatsapp` survives because the card has a
 * WhatsApp button.
 *
 * `TowTruck` extends this, so anything typed `TowTruckCard` also accepts a full
 * profile object — including the local mock fixtures, which are full objects.
 */
export interface TowTruckCard {
  id: number
  slug: string
  driverName: string
  companyName?: string
  /** Main phone — shown on cards and used for the primary call action */
  phone: string
  whatsapp?: string
  works24Hours: boolean
  /** Unset when not 24/7 and the driver never specified real hours — hide the line then */
  workingHours?: string
  /** Undefined when the driver didn't provide pricing — cards then show no price */
  startingPrice?: number
  vehicle: TowTruckCardVehicle
  services: ServiceType[]
  serviceAreas: ServiceArea[]
  location: TowTruckLocation
  /** One thumbnail from a list endpoint; the full gallery on a profile */
  images: string[]
  /** ISO datetime — used for an honest sitemap <lastmod> */
  updatedAt: string
}

/**
 * Anything the contact buttons can act on. A card carries phone + WhatsApp; a
 * full profile adds Telegram, email and the secondary phone. Typing
 * `usePhoneActions` against this is what lets one composable serve both the card
 * and the profile without pretending a card has fields it doesn't.
 */
export type TowTruckContactable = TowTruckCard &
  Partial<Pick<TowTruck, 'secondaryPhone' | 'telegram' | 'email'>>

/** The full profile — only ever returned by `GET /tow-trucks/:slug` and `/my/tow-truck` */
export interface TowTruck extends TowTruckCard {
  /** Optional secondary phone — shown only on the profile page */
  secondaryPhone?: string
  telegram?: string
  email?: string
  /** Raw driver-entered value, used by the dashboard edit form */
  workingHoursText?: string
  description: string
  vehicle: TowTruckVehicle
  pricing?: TowTruckPricing
  imageDetails?: { id: number; url: string }[]
}
