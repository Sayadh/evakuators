import { Injectable } from '@nestjs/common'
import { FreeRouteStatus, Prisma, type FreeRoute } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { FreeRouteWithTruck } from './free-route.types'

/** Only what a public free-route card needs — never the driver's full profile */
const DRIVER_CARD_SELECT = {
  slug: true,
  driverName: true,
  companyName: true,
  phone: true,
  vehicleType: true,
} satisfies Prisma.TowTruckSelect

/** Upper bound on the public listing response — see findActive() */
const PUBLIC_FREE_ROUTES_LIMIT = 200

interface FreeRouteCreateData {
  startRegionSlug: string
  startCitySlug: string
  endRegionSlug: string
  endCitySlug: string
  departureAt: Date
  estimatedArrivalAt: Date
  description?: string
}

interface FreeRouteUpdateData extends Partial<FreeRouteCreateData> {
  status?: FreeRouteStatus
}

/** All FreeRoute database access lives here — services never touch Prisma directly */
@Injectable()
export class FreeRoutesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Public listing — only active routes, and only from drivers still active/visible */
  findActive(): Promise<FreeRouteWithTruck[]> {
    return this.prisma.freeRoute.findMany({
      where: { status: FreeRouteStatus.ACTIVE, towTruck: { isActive: true } },
      include: { towTruck: { select: DRIVER_CARD_SELECT } },
      orderBy: { departureAt: 'asc' },
      // Bounded like the tow truck listing (TOW_TRUCK_LIST_MAX_LIMIT). Nothing
      // caps how many routes a driver may post, so without this one driver can
      // decide how large every public /free-routes response — and every SSR
      // render of that page — is. Soonest-departing routes are the ones worth
      // showing, and the order above already puts them first.
      take: PUBLIC_FREE_ROUTES_LIMIT,
    })
  }

  /** Driver's own routes, any status — for their dashboard management list */
  findOwn(towTruckId: number): Promise<FreeRoute[]> {
    return this.prisma.freeRoute.findMany({
      where: { towTruckId },
      orderBy: { departureAt: 'desc' },
    })
  }

  findById(id: number): Promise<FreeRoute | null> {
    return this.prisma.freeRoute.findUnique({ where: { id } })
  }

  create(towTruckId: number, data: FreeRouteCreateData): Promise<FreeRoute> {
    const createData: Prisma.FreeRouteUncheckedCreateInput = { ...data, towTruckId }
    return this.prisma.freeRoute.create({ data: createData })
  }

  update(id: number, data: FreeRouteUpdateData): Promise<FreeRoute> {
    return this.prisma.freeRoute.update({ where: { id }, data })
  }

  /** Hard delete — used both for driver-initiated removal and the cleanup cron */
  delete(id: number): Promise<FreeRoute> {
    return this.prisma.freeRoute.delete({ where: { id } })
  }

  /**
   * Cron step 1: ACTIVE -> FINISHED once the route's EFFECTIVE deadline has
   * passed. That deadline is `estimatedArrivalAt` — a route now stays
   * findable for the whole trip, not just until the driver sets off — with a
   * fallback to `departureAt` for the rare row written before that column
   * existed (`estimatedArrivalAt IS NULL`). Returns rows affected.
   */
  async markExpiredAsFinished(now: Date): Promise<number> {
    const result = await this.prisma.freeRoute.updateMany({
      where: {
        status: FreeRouteStatus.ACTIVE,
        OR: [
          { estimatedArrivalAt: { lte: now } },
          { estimatedArrivalAt: null, departureAt: { lte: now } },
        ],
      },
      data: { status: FreeRouteStatus.FINISHED },
    })
    return result.count
  }

  /**
   * Cron step 2: hard-delete FINISHED routes whose effective deadline is past
   * the grace period. Same `estimatedArrivalAt`-first, `departureAt`-fallback
   * field as step 1 above — using `departureAt` here unconditionally (the
   * field these rows were actually marked FINISHED against once) would make
   * the grace window run from the wrong instant for any route where the trip
   * itself took a meaningful chunk of the 24h grace period, or even put a
   * long trip's grace window in the past already at the moment it finishes.
   * Returns rows affected.
   */
  async deleteFinishedBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.freeRoute.deleteMany({
      where: {
        status: FreeRouteStatus.FINISHED,
        OR: [
          { estimatedArrivalAt: { lte: cutoff } },
          { estimatedArrivalAt: null, departureAt: { lte: cutoff } },
        ],
      },
    })
    return result.count
  }
}
