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
    hasTelegramLinked: truck.telegramChatId !== null,
    createdAt: truck.createdAt.toISOString(),
    images: truck.images.map((image) => ({ id: image.id, url: image.url })),
  }
}
