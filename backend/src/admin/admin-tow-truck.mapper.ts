import { decimalToNumber } from '../common/coordinates'
import type { ServiceAreaJson, TowTruckWithImages } from '../tow-trucks/tow-truck.types'

/**
 * Admin-list shape — deliberately NOT the raw Prisma row. Two reasons:
 * 1. `telegramChatId` is a BigInt, which JSON.stringify() throws on outright.
 * 2. The admin table doesn't need (and shouldn't leak) the raw link token —
 *    just whether Telegram is linked, as a plain boolean.
 */
export interface AdminTowTruckSummary {
  id: number
  slug: string
  driverName: string
  companyName?: string
  phone: string
  isActive: boolean
  /** Admin-curated "best tow trucks" homepage pick — see AdminService.setTowTruckFeatured */
  isFeatured: boolean
  vehicleBrand: string
  vehicleModel?: string
  vehicleYear: number
  locationName: string
  /**
   * Base parking coordinates, so the panel can show "already set" vs "not set"
   * and pre-fill the edit dialog. Both undefined for every driver approved
   * before the field existed.
   *
   * This is an admin-authenticated response, which is the whole reason it may
   * carry them at all — the public card and coverage shapes deliberately do
   * not, and neither does the public profile. See TowTruckApi.location.
   */
  latitude?: number
  longitude?: number
  /** ISO datetime of the last coordinate write; undefined when never set */
  locationUpdatedAt?: string
  /**
   * Everywhere the driver claims to work, with the Armenian names the frontend
   * resolved when it was written — so the panel can render the list without a
   * geography lookup of its own, and match the labels the public profile shows.
   *
   * Added for the admin removal button. Until then an admin could not see a
   * driver's coverage anywhere in the panel: `locationName` is the free-text
   * base label, and the pending-request card's «Մարզեր» row is what was
   * *submitted*, which stops describing reality the moment the driver edits
   * their own dashboard. The only way to check was to open the public profile.
   *
   * Same argument that lets this shape carry `latitude`/`longitude`: the route
   * is behind `AdminJwtGuard`. The public card shape must NOT grow fields by
   * copying this one — see CLAUDE.md § "A listing is not a profile".
   */
  serviceAreas: ServiceAreaJson[]
  /**
   * Structural placement — what the browsing pages filter on, and what the
   * removal endpoint has to re-point when the area being removed is this one.
   * At most one of the two is ever set; both are unset for a truck whose only
   * coverage is road corridors (see `findPlaceSlug` on the frontend).
   */
  citySlug?: string
  districtSlug?: string
  /** Unset for Yerevan, which is a pseudo-region — see CLAUDE.md */
  regionSlug?: string
  hasTelegramLinked: boolean
  /**
   * Whether the driver can log in at all right now — a boolean, never the hash.
   *
   * The panel needs it for one honest sentence: the reset button asks an admin
   * to revoke something, and until this existed it could not say whether there
   * was anything to revoke. False means either "approved and never onboarded"
   * or "already reset and has not tapped the new link yet"; both look identical
   * from here, and both mean the same thing to the admin — send them a link.
   *
   * Same argument that lets this shape carry coordinates and coverage: the
   * route is behind `AdminJwtGuard`. It says nothing about the password itself.
   */
  hasPassword: boolean
  createdAt: string
  images: { id: number; url: string }[]
}

export function toAdminTowTruckSummary(truck: TowTruckWithImages): AdminTowTruckSummary {
  return {
    id: truck.id,
    slug: truck.slug,
    driverName: truck.driverName,
    companyName: truck.companyName ?? undefined,
    phone: truck.phone,
    isActive: truck.isActive,
    isFeatured: truck.isFeatured,
    vehicleBrand: truck.vehicleBrand,
    vehicleModel: truck.vehicleModel ?? undefined,
    vehicleYear: truck.vehicleYear,
    locationName: truck.locationName,
    latitude: decimalToNumber(truck.latitude),
    longitude: decimalToNumber(truck.longitude),
    locationUpdatedAt: truck.locationUpdatedAt?.toISOString(),
    // `?? []` for the same reason toTowTruckApi does it: the column is JSONB and
    // Prisma types it as JsonValue, so an old row that somehow holds null must
    // render as "no areas" rather than crash the whole admin list.
    serviceAreas: (truck.serviceAreas as unknown as ServiceAreaJson[]) ?? [],
    citySlug: truck.citySlug ?? undefined,
    districtSlug: truck.districtSlug ?? undefined,
    regionSlug: truck.regionSlug ?? undefined,
    hasTelegramLinked: truck.telegramChatId !== null,
    hasPassword: truck.passwordHash !== null,
    createdAt: truck.createdAt.toISOString(),
    images: truck.images.map((image) => ({ id: image.id, url: image.url })),
  }
}
