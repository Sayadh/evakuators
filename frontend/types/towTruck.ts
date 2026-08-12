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
  /** Wheel skates — for loading a vehicle with locked/non-rotating wheels */
  wheelSkates: boolean
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
  /**
   * Base parking coordinates — the input for the future "nearest evacuator to
   * the customer" calculation.
   *
   * **Only ever populated on `GET /my/tow-truck`.** The public
   * `GET /tow-trucks/:slug` is served by the same backend mapper with
   * coordinates withheld, and no list or coverage shape carries them at all —
   * so on a card, a public profile or a coverage record these are always
   * undefined, by design and not by omission. See `TowTruckApi.location` in
   * `backend/src/tow-trucks/tow-truck.types.ts` for why they are withheld.
   *
   * Also undefined for every driver approved before the field existed
   * (the columns are nullable — see schema.prisma).
   */
  latitude?: number
  longitude?: number
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
 * photo URL that no card renders.
 *
 * The card now carries **one** way to reach a driver: the main phone, which is
 * the button it renders. `whatsapp` lingered here for a while on the
 * justification that "the card has a WhatsApp button" — it does not, and never
 * did: `TowTruckContactActions` is mounted only on the profile page, and the
 * card is a deliberate lightweight teaser with a single «Զանգահարել» link. If
 * a WhatsApp button is ever added to the card, add the field back **with** it.
 *
 * `TowTruck` extends this, so anything typed `TowTruckCard` also accepts a full
 * profile object — including the local mock fixtures, which are full objects.
 */
export interface TowTruckCard {
  id: number
  slug: string
  driverName: string
  companyName?: string
  /** Main phone — the card's one contact action. Everything else is profile-only */
  phone: string
  works24Hours: boolean
  /** Unset when not 24/7 and the driver never specified real hours — hide the line then */
  workingHours?: string
  /** Undefined when the driver didn't provide pricing — cards then show no price */
  startingPrice?: number
  vehicle: TowTruckCardVehicle
  services: ServiceType[]
  serviceAreas: ServiceArea[]
  location: TowTruckLocation
  /**
   * Approved reviews only, **absent when the driver has none** — mirrors
   * `TowTruckCardApi.rating` on the backend.
   *
   * The absence is load-bearing, not laziness: it is how the listing order
   * tells "not rated yet" from "rated badly" (see `getRecommendedScore()` in
   * `utils/towTruckFilters.ts`). Nothing renders this today — it exists so the
   * ordering has real data to work with.
   */
  rating?: {
    average: number
    count: number
  }
  /** One thumbnail from a list endpoint; the full gallery on a profile */
  images: string[]
  /** ISO datetime — used for an honest sitemap <lastmod> */
  updatedAt: string
}

/**
 * Anything the contact buttons can act on. A card carries the main phone; a
 * full profile adds WhatsApp, Telegram, email and the secondary phone. Typing
 * `usePhoneActions` against this is what lets one composable serve both the card
 * and the profile without pretending a card has fields it doesn't — every extra
 * channel is `Partial`, so the composable's `value.whatsapp ? … : null` guards
 * are the same code path a card takes.
 */
export type TowTruckContactable = TowTruckCard &
  Partial<Pick<TowTruck, 'secondaryPhone' | 'whatsapp' | 'telegram' | 'email'>>

/** The full profile — only ever returned by `GET /tow-trucks/:slug` and `/my/tow-truck` */
export interface TowTruck extends TowTruckCard {
  /** Optional secondary phone — shown only on the profile page */
  secondaryPhone?: string
  /** Profile-page contact button, like `telegram`/`email` — never on a card */
  whatsapp?: string
  telegram?: string
  email?: string
  /** Raw driver-entered value, used by the dashboard edit form */
  workingHoursText?: string
  /**
   * ISO datetime of the last coordinate write. Same visibility rule as
   * `location.latitude` — driver's own profile only, and absent when no
   * coordinates have ever been set.
   */
  locationUpdatedAt?: string
  description: string
  vehicle: TowTruckVehicle
  pricing?: TowTruckPricing
  imageDetails?: { id: number; url: string }[]
}
