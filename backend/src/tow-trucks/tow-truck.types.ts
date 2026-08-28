import type { Prisma, TowTruck, TowTruckImage } from '@prisma/client'

export type TowTruckWithImages = TowTruck & { images: TowTruckImage[] }

export interface TowTruckFilters {
  citySlug?: string
  districtSlug?: string
  regionSlug?: string
  /** Extra city slugs of a region (static data lives in the frontend) */
  regionCitySlugs?: string[]
  /** A road corridor slug — matched exactly, never expanded to nearby places */
  zoneSlug?: string
  /** Road corridors of a region, the zone counterpart of `regionCitySlugs` */
  regionZoneSlugs?: string[]
  /** Any Yerevan-related truck (based in a district or serving one) */
  yerevan?: boolean
  /**
   * A `VehicleType` slug. Narrows the result — it is ANDed with whatever
   * geography is asked for, never ORed into it. `manipulator` expands to a
   * union; see `buildWhere`.
   */
  vehicleType?: string
  limit?: number
  /** Page offset — only used by consumers that must walk past the list cap */
  offset?: number
}

/**
 * What a listing card actually renders, and nothing else.
 *
 * The list endpoints used to return the full `TowTruckApi` for every truck,
 * which meant one unauthenticated `GET /tow-trucks` handed out **every driver's
 * secondary phone, WhatsApp and Telegram** — the whole contact
 * database of the platform, in one request, to anyone. It also shipped their
 * plate number, platform dimensions, full price list, description and every
 * photo URL, none of which a card displays.
 *
 * So the list and the detail endpoints now return deliberately different
 * shapes. The card carries **one** way to reach a driver — the main phone,
 * which is the button it renders. WhatsApp, Telegram and the secondary
 * phone are all profile-page details, because `TowTruckContactActions` (the
 * component that renders those buttons) is only ever mounted on
 * `GET /tow-trucks/:slug`; the card mounts a single «Զանգահարել» link.
 *
 * `whatsapp` was the exception here for a while, justified by "the card has a
 * WhatsApp button". It does not and never did — the card is a deliberate
 * lightweight teaser — so the field was published for every driver in bulk in
 * exchange for nothing. If a WhatsApp button is ever added to the card, add
 * the field back **with** it, not before.
 */

export interface TowTruckCardApi {
  id: number
  slug: string
  driverName: string
  companyName?: string
  /** Main phone only — the card's one contact action. Everything else is profile-only */
  phone: string
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
    /**
     * Also the filter sidebar's — «2-հարկանի էվակուատոր» is a checkbox there,
     * and the filtering runs client-side over this card shape, so a card that
     * omitted it could not be matched at all.
     */
    doubleDeck: boolean
  }
  services: string[]
  serviceAreas: ServiceAreaJson[]
  location: {
    regionSlug?: string
    citySlug?: string
    districtSlug?: string
    name: string
  }
  /**
   * Approved reviews only, and **omitted entirely when there are none** —
   * never `null`, never a zero, and never an invented default.
   *
   * That absence is meaningful: it is how the frontend tells "nobody has rated
   * this driver yet" apart from "rated badly", which the listing order depends
   * on (see `getRecommendedScore()` in frontend/utils/towTruckFilters.ts). A
   * placeholder value here would make an unrated driver indistinguishable from
   * a rated one, and any invented figure would also be a rating the site
   * displays without anyone having given it.
   */
  rating?: {
    average: number
    count: number
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

/**
 * One stored entry of `TowTruck.serviceAreas`, as it comes back out of the
 * JSONB column.
 *
 * MANUAL SYNC POINT: `type` must equal `ServiceAreaDto.type` (the write side)
 * and `LocationType` in `frontend/types/enums.ts`. It said `'region'` for a
 * while — a value nothing has ever written — while the third real value,
 * `'route'` (a road corridor like «Գառնի–Գեղարդ»), was missing. Nothing broke,
 * because reads only ever pass the value straight through; but any backend code
 * that switches on the type would have been type-checked against a union that
 * does not describe the data.
 */
export interface ServiceAreaJson {
  name: string
  slug: string
  type: 'city' | 'district' | 'route' | 'region'
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
    /**
     * The specialist technical figures — public, and absent rather than zero
     * when the question was never asked. A customer with a 22-tonne excavator
     * is deciding on exactly these numbers, so unlike `heavyEquipment` below
     * they belong on the profile: they are a specification, not a page filter.
     */
    craneCapacityTons?: number
    craneReachM?: number
    maxLoadTons?: number
    platformLoadHeightCm?: number
    winch: boolean
    manipulator: boolean
    wheelSkates: boolean
    doubleDeck: boolean
    /**
     * «Ծանր տեխնիկայի տեղափոխում», as approved by a moderator.
     *
     * Present ONLY on the driver's own `GET /my/tow-truck`, never on the public
     * profile — the same withholding rule `location.latitude` and
     * `plateNumber` follow, and the same reason `docs/taxonomies.md` gives:
     * this is what puts a truck on `/tsanr-tehnika`, a page filter rather than
     * a badge, and putting it in the public JSON publishes it for every driver
     * at once. The dashboard needs it back because the driver may now propose
     * it, so it is asked for explicitly via `includeOwnerFields`.
     */
    heavyEquipment?: boolean
    plateNumber?: string
    showPlateNumber: boolean
  }
  services: string[]
  serviceAreas: ServiceAreaJson[]
  /**
   * «Ամբողջ Հայաստան» — public, unlike `vehicle.heavyEquipment`, because it is
   * an answer to "where do you work" and that is the whole of what
   * `serviceAreas` is for. A profile listing one city while the driver in fact
   * covers the country is a listing that loses them the job.
   */
  servesAllArmenia: boolean
  location: {
    regionSlug?: string
    citySlug?: string
    districtSlug?: string
    name: string
    /**
     * Base parking coordinates — present ONLY on the driver's own
     * `GET /my/tow-truck`, never on the public `GET /tow-trucks/:slug`, even
     * though both are served by `toTowTruckApi`. The mapper withholds them
     * unless explicitly asked, the same way it withholds `plateNumber` from a
     * driver who opted out.
     *
     * They exist to compute "which driver is nearest to this customer" on our
     * side, not to publish where a driver parks overnight. Nothing on the
     * public site renders them today, and a field that is in the JSON but not
     * on the page is published all the same — that is exactly how the whole
     * contact database used to leak through the listing endpoint (see
     * TowTruckCardApi). When a distance feature eventually needs them, it needs
     * a *distance*, which is a number the backend can return without ever
     * handing out the point it was computed from.
     */
    latitude?: number
    longitude?: number
  }
  /** ISO datetime of the last coordinate write — same visibility rule as `location.latitude` */
  locationUpdatedAt?: string
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
