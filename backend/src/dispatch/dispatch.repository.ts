import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { DispatchReferral } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { YEREVAN_REGION_SLUG } from '../tow-trucks/service-area-limits'
import type { DispatchPlace } from './dispatch-ranking'

/** Per-driver referral totals, in one grouped pass rather than one query per row */
export interface ReferralStatsRow {
  towTruckId: number
  total: number
  lastDispatchedAt: Date
}

/** Just enough of a truck to rank it and dial it */
export type DispatchCandidateRow = Prisma.TowTruckGetPayload<{
  select: {
    id: true
    driverName: true
    companyName: true
    phone: true
    vehicleBrand: true
    vehicleModel: true
    vehicleType: true
    locationName: true
    regionSlug: true
    citySlug: true
    districtSlug: true
    servesAllArmenia: true
    serviceAreas: true
    isFeatured: true
    featuredUntil: true
  }
}>

@Injectable()
export class DispatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every ACTIVE driver who has anything to do with this place.
   *
   * ## Why the OR is the same shape the public search uses
   *
   * "Who can help in Abovyan" is a question this codebase already answers, on
   * the busiest page it has (`buildWhere` in `tow-trucks.repository.ts`). The
   * three arms are the same three: the driver is based there, they named it in
   * `serviceAreas`, or they declared the whole country. Reproducing them here
   * rather than reusing that method is deliberate — the public one also
   * carries vehicle-type unions, sorting, pagination and card shaping, none of
   * which this screen wants, and none of which should have to stay compatible
   * with a dispatcher's needs.
   *
   * `isActive: true` and nothing about payment: see `DispatchService` for why
   * the subscription is shown rather than filtered on.
   */
  findCandidates(place: DispatchPlace): Promise<DispatchCandidateRow[]> {
    return this.prisma.towTruck.findMany({
      where: {
        isActive: true,
        OR: [
          ...baseClause(place),
          { serviceAreas: { array_contains: [{ slug: place.slug, type: place.type }] } },
          ...regionWidening(place),
          { servesAllArmenia: true },
        ],
      },
      select: {
        id: true,
        driverName: true,
        companyName: true,
        phone: true,
        vehicleBrand: true,
        vehicleModel: true,
        vehicleType: true,
        locationName: true,
        regionSlug: true,
        citySlug: true,
        districtSlug: true,
        servesAllArmenia: true,
        serviceAreas: true,
        isFeatured: true,
        featuredUntil: true,
      },
    })
  }

  /**
   * Total referrals and the most recent one, for a page of drivers at once.
   *
   * One grouped query rather than one per row, for the same reason
   * `groupApprovedByTowTruckIds` exists: this list is read while somebody is
   * waiting on the phone, and a round trip per candidate is the difference
   * between an answer and a pause.
   */
  async statsFor(towTruckIds: number[]): Promise<Map<number, ReferralStatsRow>> {
    if (towTruckIds.length === 0) return new Map()

    const rows = await this.prisma.dispatchReferral.groupBy({
      by: ['towTruckId'],
      where: { towTruckId: { in: towTruckIds } },
      _count: { _all: true },
      _max: { createdAt: true },
    })

    const stats = new Map<number, ReferralStatsRow>()
    for (const row of rows) {
      if (row._max.createdAt === null) continue
      stats.set(row.towTruckId, {
        towTruckId: row.towTruckId,
        total: row._count._all,
        lastDispatchedAt: row._max.createdAt,
      })
    }
    return stats
  }

  /**
   * How many each driver was given since `since` — the "this month" number.
   *
   * A second grouped query rather than a window function, because Prisma has
   * no typed way to express one and the alternative (raw SQL) would put this
   * screen's shape outside the schema's reach for the sake of one integer.
   */
  async countsSince(towTruckIds: number[], since: Date): Promise<Map<number, number>> {
    if (towTruckIds.length === 0) return new Map()

    const rows = await this.prisma.dispatchReferral.groupBy({
      by: ['towTruckId'],
      where: { towTruckId: { in: towTruckIds }, createdAt: { gte: since } },
      _count: { _all: true },
    })

    return new Map(rows.map((row) => [row.towTruckId, row._count._all]))
  }

  create(data: {
    towTruckId: number
    locationSlug: string
    locationName: string
    locationType: string
    adminUserId: number
  }): Promise<DispatchReferral> {
    return this.prisma.dispatchReferral.create({ data })
  }

  /** The driver's own count, for their dashboard — "12 jobs this month" */
  countForTowTruckSince(towTruckId: number, since: Date): Promise<number> {
    return this.prisma.dispatchReferral.count({
      where: { towTruckId, createdAt: { gte: since } },
    })
  }
}

/**
 * "Is this driver BASED here" as a where clause.
 *
 * Returns an array so a place with no base column at all contributes nothing
 * to the `OR` instead of a clause that matches the wrong thing. Two places
 * have no base column:
 *
 * - a road corridor — nobody is based on a road, and falling back to
 *   `regionSlug` would put every driver in the marz into the LOCAL tier for a
 *   road they never mentioned;
 * - and Yerevan is the opposite case: it HAS a base test, just not the obvious
 *   one, because its drivers carry a `districtSlug` and a null `regionSlug`.
 *
 * Mirrors `isBasedIn` in dispatch-ranking.ts, which decides the tier for the
 * rows this returns. The two must agree — a row this finds but that one tiers
 * as `null` is dropped from the list again, silently.
 */
function baseClause(place: DispatchPlace): Prisma.TowTruckWhereInput[] {
  switch (place.type) {
    case 'district':
      return [{ districtSlug: place.slug }]
    case 'city':
      return [{ citySlug: place.slug }]
    case 'region':
      return place.slug === YEREVAN_REGION_SLUG
        ? [{ districtSlug: { not: null } }]
        : [{ regionSlug: place.slug }]
    default:
      return []
  }
}

/**
 * A marz also means the towns and corridors inside it.
 *
 * Almost nobody stores `{slug: 'kotayk', type: 'region'}`; they list Աբովյան
 * and Հրազդան. See `declaresArea` for the full reasoning — this is the same
 * widening `buildWhere` applies to the public region page.
 */
function regionWidening(place: DispatchPlace): Prisma.TowTruckWhereInput[] {
  if (place.type !== 'region') return []

  if (place.slug === YEREVAN_REGION_SLUG) {
    // No shared slug to expand into: any district service area is Yerevan.
    return [{ serviceAreas: { array_contains: [{ type: 'district' }] } }]
  }

  return [
    ...(place.regionCitySlugs ?? []).map((slug) => ({
      serviceAreas: { array_contains: [{ slug, type: 'city' }] },
    })),
    ...(place.regionZoneSlugs ?? []).map((slug) => ({
      serviceAreas: { array_contains: [{ slug, type: 'route' }] },
    })),
  ]
}
