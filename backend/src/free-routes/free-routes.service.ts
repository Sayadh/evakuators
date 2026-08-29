import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { FreeRoute } from '@prisma/client'
import { AdminNotificationService } from '../admin-auth/admin-notification.service'
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
    private readonly adminNotification: AdminNotificationService,
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
    const estimatedArrivalAt = this.parseEstimatedArrivalAt(dto.estimatedArrivalAt, departureAt)

    const route = await this.freeRoutesRepository.create(towTruckId, {
      startRegionSlug: dto.startRegionSlug,
      startCitySlug: dto.startCitySlug,
      endRegionSlug: dto.endRegionSlug,
      endCitySlug: dto.endCitySlug,
      departureAt,
      estimatedArrivalAt,
      description: dto.description,
    })

    // Best-effort, same as RegistrationService's new-registration notice —
    // AdminNotificationService catches its own per-admin send failures, a
    // Telegram hiccup here must never fail the driver's request. Only fires
    // for a genuinely new route: update() re-activates an existing one
    // (a driver re-posting/fixing a typo), which isn't news to an admin.
    const contact = await this.towTrucksRepository.findContactById(towTruckId)
    if (contact) {
      await this.adminNotification.notifyNewFreeRoute({
        driverName: contact.driverName,
        companyName: contact.companyName,
        phone: contact.phone,
        startRegionSlug: dto.startRegionSlug,
        startCitySlug: dto.startCitySlug,
        endRegionSlug: dto.endRegionSlug,
        endCitySlug: dto.endCitySlug,
        departureAt,
        estimatedArrivalAt,
      })
    }

    return toMyFreeRouteApi(route)
  }

  async update(towTruckId: number, id: number, dto: UpdateFreeRouteDto): Promise<MyFreeRouteApi> {
    await this.assertActiveDriver(towTruckId)
    const existing = await this.getOwnedOrThrow(towTruckId, id)

    // departureAt itself is allowed to be in the past here (unlike create) —
    // a route the driver is already driving is exactly the case the arrival
    // range exists to keep findable. What must NOT be in the past is the
    // route's effective deadline, checked below.
    const departureAt = dto.departureAt
      ? this.parseDepartureAt(dto.departureAt)
      : existing.departureAt

    // Three cases: a fresh arrival in the dto is validated against the
    // (possibly new) departureAt by parseEstimatedArrivalAt itself. Keeping
    // the existing arrival still needs that same check done by hand here —
    // otherwise pushing departureAt past an untouched estimatedArrivalAt
    // would silently store a route that arrives before it departs. A legacy
    // row with no arrival at all has nothing to check against; it falls back
    // to departureAt, same as every other reader of this field.
    let estimatedArrivalAt: Date
    if (dto.estimatedArrivalAt) {
      estimatedArrivalAt = this.parseEstimatedArrivalAt(dto.estimatedArrivalAt, departureAt)
    } else if (existing.estimatedArrivalAt) {
      if (existing.estimatedArrivalAt.getTime() <= departureAt.getTime()) {
        throw new BadRequestException('Ժամանման ժամը պետք է լինի մեկնման ժամից ուշ')
      }
      estimatedArrivalAt = existing.estimatedArrivalAt
    } else {
      estimatedArrivalAt = departureAt
    }

    // Editing a route is the driver re-posting it, so it goes back to ACTIVE —
    // but only if its EFFECTIVE deadline (estimatedArrivalAt, same field the
    // cron now keys off) would actually still be in the future. Reactivating
    // unconditionally (which is what this used to do, against departureAt)
    // republished a finished route whose deadline had already passed: it
    // stayed publicly listed until the next cron tick, and if the deadline was
    // more than the grace period ago the very next tick marked it FINISHED
    // and then hard-deleted it — so a driver who fixed a typo in the
    // description watched their route disappear.
    if (estimatedArrivalAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Այս երթուղու ժամանման ժամն արդեն անցել է։ Խմբագրելու համար նշեք նոր ամսաթվեր/ժամեր։',
      )
    }

    const route = await this.freeRoutesRepository.update(existing.id, {
      startRegionSlug: dto.startRegionSlug,
      startCitySlug: dto.startCitySlug,
      endRegionSlug: dto.endRegionSlug,
      endCitySlug: dto.endCitySlug,
      description: dto.description,
      departureAt,
      estimatedArrivalAt,
      status: 'ACTIVE',
    })
    return toMyFreeRouteApi(route)
  }

  async remove(towTruckId: number, id: number): Promise<{ id: number }> {
    await this.assertActiveDriver(towTruckId)
    const existing = await this.getOwnedOrThrow(towTruckId, id)
    // Manual delete is always immediate and permanent — unlike the cron's
    // ACTIVE -> FINISHED -> (grace period) -> deleted path, there's no point
    // keeping a row around the driver themselves just asked to remove.
    await this.freeRoutesRepository.delete(existing.id)
    return { id: existing.id }
  }

  /**
   * Applied to create, update AND remove — everything a driver can do to a
   * route. Only create() used to check, which left a deactivated driver
   * writing to rows behind a still-valid 30-day JWT. Nothing they wrote could
   * reach the public list (findActive() joins on `towTruck.isActive`), but the
   * rule that a deactivated profile is frozen is the same rule
   * MyTowTruckService enforces on every single call, and this module quietly
   * disagreeing with it is how the two drift apart.
   */
  private async assertActiveDriver(towTruckId: number): Promise<void> {
    // findStatusById, not findById: this needs one boolean, and findById pulls
    // the full row plus an ordered join over every image the driver owns. Same
    // reasoning as the analytics write path, which is why that lean probe
    // already exists (see TowTrucksRepository.findStatusById).
    const towTruck = await this.towTrucksRepository.findStatusById(towTruckId)
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
   * `departureAt` is passed in already resolved (parsed and, on create,
   * confirmed future) rather than re-derived here, so this only ever has to
   * ask one question: does arrival make sense relative to it.
   */
  private parseEstimatedArrivalAt(value: string, departureAt: Date): Date {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Սխալ ամսաթիվ/ժամ')
    }
    if (date.getTime() <= departureAt.getTime()) {
      throw new BadRequestException('Ժամանման ժամը պետք է լինի մեկնման ժամից ուշ')
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
