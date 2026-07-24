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

interface FreeRouteCreateData {
  startRegionSlug: string
  startCitySlug: string
  endRegionSlug: string
  endCitySlug: string
  departureAt: Date
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

  /** Cron step 1: ACTIVE -> FINISHED once departure has passed. Returns rows affected. */
  async markExpiredAsFinished(now: Date): Promise<number> {
    const result = await this.prisma.freeRoute.updateMany({
      where: { status: FreeRouteStatus.ACTIVE, departureAt: { lte: now } },
      data: { status: FreeRouteStatus.FINISHED },
    })
    return result.count
  }

  /** Cron step 2: hard-delete FINISHED routes past the grace period. Returns rows affected. */
  async deleteFinishedBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.freeRoute.deleteMany({
      where: { status: FreeRouteStatus.FINISHED, departureAt: { lte: cutoff } },
    })
    return result.count
  }
}
