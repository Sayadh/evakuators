import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { assertWithinArmenia } from '../common/coordinates'
import { ReviewsRepository } from '../reviews/reviews.repository'
import { isFeaturedNow } from '../tow-trucks/featured'
import { derivePaymentStatus } from '../subscriptions/subscription-status'
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository'
import { DISPATCH_COORDINATES_LIMIT, DISPATCH_COORDINATES_RADIUS_METERS } from './dispatch.constants'
import {
  compareCandidates,
  dispatchTier,
  matchesDispatchFilter,
  type DispatchFilter,
  type DispatchPlace,
} from './dispatch-ranking'
import { DispatchRepository, type DispatchCandidateRow } from './dispatch.repository'
import type {
  DispatchCandidateApi,
  DispatchCandidateByDistanceApi,
  DispatchCandidatesApi,
  DispatchCandidatesByCoordinatesApi,
  DispatchReferralApi,
} from './dispatch.types'

/** First instant of the current calendar month, for the "this month" count */
function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/** `serviceAreas` is Json in Prisma; this is the shape the profile actually stores */
function readServiceAreas(value: unknown): Array<{ slug: string; type: string }> {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is { slug: string; type: string } =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { slug?: unknown }).slug === 'string' &&
      typeof (entry as { type?: unknown }).type === 'string',
  )
}

/** The lookups every candidate row needs, gathered once per request and shared by both search modes */
interface CandidateLookups {
  stats: Map<number, { total: number; lastDispatchedAt: Date }>
  monthCounts: Map<number, number>
  ratingById: Map<number, number>
  coverage: Map<number, { paidUntil: Date | null }>
  /** One instant for the whole list, so two rows cannot disagree about it */
  now: Date
}

/**
 * The dispatcher's screen: who to offer a job in this place to, and the record
 * that it was offered.
 *
 * ## Why the subscription is shown and not filtered on
 *
 * The obvious rule — "only paying drivers get dispatched" — would make this
 * screen EMPTY on the day it ships. Payments are gated behind merchant
 * credentials (`SUBSCRIPTIONS_PILOT_TOW_TRUCK_IDS`, `IDRAM_*`), so today
 * almost every driver reads as `unpaid`: nobody has ever billed them. A list
 * that shows nothing is not a stricter version of this tool, it is a broken
 * one.
 *
 * So the status travels as a badge and the operator decides. Once the fleet is
 * actually subscribed, turning it into a filter is one `where` clause — and by
 * then it will be a real distinction rather than a reflection of a feature
 * that has not been switched on.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name)

  constructor(
    private readonly dispatchRepository: DispatchRepository,
    private readonly reviewsRepository: ReviewsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  async listCandidates(
    place: DispatchPlace,
    filter: DispatchFilter = 'all',
  ): Promise<DispatchCandidatesApi> {
    const trucks = await this.dispatchRepository.findCandidates(place)
    const ids = trucks.map((truck) => truck.id)
    const lookups = await this.gatherLookups(ids)

    const items = trucks
      .map((truck) => this.toCandidate(truck, place, lookups))
      .filter((candidate): candidate is DispatchCandidateApi => candidate !== null)
      .filter((candidate) => this.matchesFilter(candidate, filter, lookups.now))
      .sort((a, b) =>
        compareCandidates(
          { tier: a.tier, isFeatured: a.isFeatured, rating: a.rating ?? null, driverName: a.driverName },
          { tier: b.tier, isFeatured: b.isFeatured, rating: b.rating ?? null, driverName: b.driverName },
        ),
      )

    return { place, items }
  }

  /**
   * Who is closest to a point the dispatcher typed or read off a map —
   * "search by coordinates", alongside `listCandidates`'s "search by place".
   *
   * Straight-line distance only, deliberately: this is the dispatcher's own
   * screen, not the customer-facing `nearest-tow-trucks` search, and it does
   * not draw on that search's OpenRouteService quota — a road-accurate ranking
   * here would mean two features racing for one shared daily budget for a
   * screen where the operator already applies their own judgement on top of
   * the number.
   */
  async listCandidatesByCoordinates(
    latitude: number,
    longitude: number,
    filter: DispatchFilter = 'all',
  ): Promise<DispatchCandidatesByCoordinatesApi> {
    // Same geography rule every coordinate-accepting endpoint applies — a
    // dispatcher pointing outside Armenia is a typo, not a place to search.
    assertWithinArmenia(latitude, longitude)

    const distances = await this.dispatchRepository.findCandidatesByDistance(
      latitude,
      longitude,
      DISPATCH_COORDINATES_RADIUS_METERS,
      DISPATCH_COORDINATES_LIMIT,
    )
    if (distances.length === 0) return { latitude, longitude, items: [] }

    const distanceById = new Map(distances.map((row) => [row.id, row.distanceMeters]))
    const ids = distances.map((row) => row.id)
    const [trucks, lookups] = await Promise.all([
      this.dispatchRepository.findCandidatesByIds(ids),
      this.gatherLookups(ids),
    ])

    const items = trucks
      .map((truck) => this.toCandidateByDistance(truck, distanceById.get(truck.id) ?? 0, lookups))
      .filter((candidate) => this.matchesFilter(candidate, filter, lookups.now))
      // Re-sorted explicitly: `findCandidatesByIds` does not preserve the
      // order `findCandidatesByDistance` returned (Prisma's `id: { in }`
      // does not), and "nearest first" is the entire point of this search.
      .sort((a, b) => a.distanceMeters - b.distanceMeters)

    return { latitude, longitude, items }
  }

  /**
   * Four reads, all grouped and all in parallel — this list is built while
   * somebody is on the phone, so the shape that matters is "one round trip
   * per FACT", never one per driver. Shared by both search modes so neither
   * one drifts into fetching a fact the other renders differently.
   */
  private async gatherLookups(ids: number[]): Promise<CandidateLookups> {
    const now = new Date()
    const [stats, monthCounts, ratings, coverage] = await Promise.all([
      this.dispatchRepository.statsFor(ids),
      this.dispatchRepository.countsSince(ids, startOfMonth(now)),
      this.reviewsRepository.groupApprovedByTowTruckIds(ids),
      this.subscriptionsRepository.findCoverage(ids),
    ])

    return {
      stats,
      monthCounts,
      ratingById: new Map(ratings.map((row) => [row.towTruckId, row.averageRating])),
      coverage,
      now,
    }
  }

  private matchesFilter(
    candidate: { isFeatured: boolean; lastDispatchedAt?: string; dispatchesTotal: number },
    filter: DispatchFilter,
    now: Date,
  ): boolean {
    return matchesDispatchFilter(
      {
        isFeatured: candidate.isFeatured,
        lastDispatchedAt: candidate.lastDispatchedAt ? new Date(candidate.lastDispatchedAt) : null,
        dispatchCount: candidate.dispatchesTotal,
      },
      filter,
      now,
    )
  }

  private toCandidate(
    truck: DispatchCandidateRow,
    place: DispatchPlace,
    lookups: CandidateLookups,
  ): DispatchCandidateApi | null {
    const tier = dispatchTier(
      {
        regionSlug: truck.regionSlug,
        citySlug: truck.citySlug,
        districtSlug: truck.districtSlug,
        servesAllArmenia: truck.servesAllArmenia,
        serviceAreas: readServiceAreas(truck.serviceAreas),
      },
      place,
    )
    // Unreachable through `findCandidates`, whose OR is the same three arms —
    // but the tiering is the authority on who belongs in the list, and a row
    // it cannot place is one the operator must not be shown.
    if (tier === null) return null

    return { ...this.candidateFields(truck, lookups), tier }
  }

  private toCandidateByDistance(
    truck: DispatchCandidateRow,
    distanceMeters: number,
    lookups: CandidateLookups,
  ): DispatchCandidateByDistanceApi {
    return { ...this.candidateFields(truck, lookups), distanceMeters: Math.round(distanceMeters) }
  }

  /** Everything both candidate shapes share — see `DispatchCandidateByDistanceApi` */
  private candidateFields(
    truck: DispatchCandidateRow,
    lookups: CandidateLookups,
  ): Omit<DispatchCandidateApi, 'tier'> {
    const stats = lookups.stats.get(truck.id)
    const rating = lookups.ratingById.get(truck.id)

    return {
      id: truck.id,
      driverName: truck.driverName,
      companyName: truck.companyName ?? undefined,
      phone: truck.phone,
      vehicle: [truck.vehicleBrand, truck.vehicleModel].filter(Boolean).join(' '),
      baseName: truck.locationName,
      // Through the window, not the raw flag: an expired placement must not
      // keep a driver at the top of the dispatcher's list, and it must not keep
      // them in the «Լավագույնները» filter either. Same rule as every public
      // read — see `isFeaturedNow`.
      isFeatured: isFeaturedNow(truck, lookups.now),
      rating: rating === undefined ? undefined : Number(rating.toFixed(1)),
      subscriptionStatus: derivePaymentStatus(lookups.coverage.get(truck.id)?.paidUntil ?? null),
      dispatchesThisMonth: lookups.monthCounts.get(truck.id) ?? 0,
      dispatchesTotal: stats?.total ?? 0,
      lastDispatchedAt: stats?.lastDispatchedAt.toISOString(),
    }
  }

  /**
   * Records that a job was handed over.
   *
   * Written on «Ուղղորդված է», which the operator presses AFTER a driver
   * agreed on the phone — not on «Զանգել». Calls nobody answered leave nothing
   * here, so the count means work offered rather than numbers dialled. See
   * `DispatchReferral` in schema.prisma.
   */
  async recordReferral(
    input: { towTruckId: number; locationSlug: string; locationName: string; locationType: string },
    adminUserId: number,
  ): Promise<DispatchReferralApi> {
    const referral = await this.dispatchRepository
      .create({ ...input, adminUserId })
      .catch(() => null)

    if (!referral) {
      throw new NotFoundException(`Էվակուատոր #${input.towTruckId}-ը չի գտնվել`)
    }

    this.logger.log(
      `Dispatch referral #${referral.id}: TowTruck #${input.towTruckId} for ${input.locationName} ` +
        `by admin #${adminUserId}`,
    )

    return {
      id: referral.id,
      towTruckId: referral.towTruckId,
      driverName: '',
      locationName: referral.locationName,
      createdAt: referral.createdAt.toISOString(),
    }
  }
}
