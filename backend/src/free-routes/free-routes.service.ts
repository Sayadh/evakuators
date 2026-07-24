import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { FreeRoute } from '@prisma/client'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import type { CreateFreeRouteDto } from './dto/create-free-route.dto'
import type { UpdateFreeRouteDto } from './dto/update-free-route.dto'
import { toFreeRouteApi, toMyFreeRouteApi } from './free-route.mapper'
import type { FreeRouteApi, MyFreeRouteApi } from './free-route.types'
import { FreeRoutesRepository } from './free-routes.repository'

/**
 * How long a FINISHED route stays visible in the driver's own dashboard
 * (as history) before the cleanup cron purges it for good. Manual deletion
 * by the driver skips this entirely — see remove() below.
 */
const FINISHED_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

@Injectable()
export class FreeRoutesService {
  private readonly logger = new Logger(FreeRoutesService.name)

  constructor(
    private readonly freeRoutesRepository: FreeRoutesRepository,
    private readonly towTrucksRepository: TowTrucksRepository,
  ) {}

  async listPublic(): Promise<FreeRouteApi[]> {
    const routes = await this.freeRoutesRepository.findActive()
    return routes.map(toFreeRouteApi)
  }

  async listMine(towTruckId: number): Promise<MyFreeRouteApi[]> {
    const routes = await this.freeRoutesRepository.findOwn(towTruckId)
    return routes.map(toMyFreeRouteApi)
  }

  async create(towTruckId: number, dto: CreateFreeRouteDto): Promise<MyFreeRouteApi> {
    await this.assertActiveDriver(towTruckId)
    const departureAt = this.parseDepartureAt(dto.departureAt)

    const route = await this.freeRoutesRepository.create(towTruckId, {
      startRegionSlug: dto.startRegionSlug,
      startCitySlug: dto.startCitySlug,
      endRegionSlug: dto.endRegionSlug,
      endCitySlug: dto.endCitySlug,
      departureAt,
      description: dto.description,
    })
    return toMyFreeRouteApi(route)
  }

  async update(towTruckId: number, id: number, dto: UpdateFreeRouteDto): Promise<MyFreeRouteApi> {
    const existing = await this.getOwnedOrThrow(towTruckId, id)

    const route = await this.freeRoutesRepository.update(existing.id, {
      startRegionSlug: dto.startRegionSlug,
      startCitySlug: dto.startCitySlug,
      endRegionSlug: dto.endRegionSlug,
      endCitySlug: dto.endCitySlug,
      description: dto.description,
      ...(dto.departureAt ? { departureAt: this.parseDepartureAt(dto.departureAt) } : {}),
      // Editing a route is the driver re-posting it — reactivate it even if
      // the cron had already marked it FINISHED in the meantime.
      status: 'ACTIVE',
    })
    return toMyFreeRouteApi(route)
  }

  async remove(towTruckId: number, id: number): Promise<{ id: number }> {
    const existing = await this.getOwnedOrThrow(towTruckId, id)
    // Manual delete is always immediate and permanent — unlike the cron's
    // ACTIVE -> FINISHED -> (grace period) -> deleted path, there's no point
    // keeping a row around the driver themselves just asked to remove.
    await this.freeRoutesRepository.delete(existing.id)
    return { id: existing.id }
  }

  private async assertActiveDriver(towTruckId: number): Promise<void> {
    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck || !towTruck.isActive) {
      throw new ForbiddenException('Ձեր պրոֆիլն ապաակտիվացված է, դիմեք admin-ին')
    }
  }

  private async getOwnedOrThrow(towTruckId: number, id: number): Promise<FreeRoute> {
    const route = await this.freeRoutesRepository.findById(id)
    if (!route) throw new NotFoundException('Երթուղին չի գտնվել')
    if (route.towTruckId !== towTruckId) {
      throw new ForbiddenException('Սա ձեր երթուղին չէ')
    }
    return route
  }

  private parseDepartureAt(value: string): Date {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Սխալ ամսաթիվ/ժամ')
    }
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('Մեկնման ժամը պետք է լինի ապագայում')
    }
    return date
  }

  /**
   * Every 10 minutes: close out routes whose departure time has passed
   * (ACTIVE -> FINISHED), then purge routes that have sat in FINISHED past
   * the grace period. Keeps the table from growing unboundedly while still
   * giving the driver a short window to see "this one already ran".
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async cleanupExpiredRoutes(): Promise<void> {
    const now = new Date()
    const finishedCount = await this.freeRoutesRepository.markExpiredAsFinished(now)
    const cutoff = new Date(now.getTime() - FINISHED_GRACE_PERIOD_MS)
    const deletedCount = await this.freeRoutesRepository.deleteFinishedBefore(cutoff)

    if (finishedCount > 0 || deletedCount > 0) {
      this.logger.log(`Free routes cleanup: ${finishedCount} marked finished, ${deletedCount} deleted`)
    }
  }
}
