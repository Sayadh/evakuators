import { decimalToNumber } from '../common/coordinates'
import type { TowTruckWithImages } from '../tow-trucks/tow-truck.types'

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
  hasTelegramLinked: boolean
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
    hasTelegramLinked: truck.telegramChatId !== null,
    createdAt: truck.createdAt.toISOString(),
    images: truck.images.map((image) => ({ id: image.id, url: image.url })),
  }
}
