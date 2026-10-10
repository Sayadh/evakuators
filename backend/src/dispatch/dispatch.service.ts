import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { assertWithinArmenia } from '../common/coordinates'
import { ReviewsRepository } from '../reviews/reviews.repository'
import { RouteMatrixService, type RouteMatrixEntry } from '../routing/route-matrix.service'
import { RouteQuotaService } from '../routing/route-quota.service'
import { isFeaturedNow } from '../tow-trucks/featured'
import { derivePaymentStatus } from '../subscriptions/subscription-status'
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository'
import {
  dispatchCallsWindowStart,
  DISPATCH_COORDINATES_LIMIT,
  DISPATCH_COORDINATES_RADIUS_METERS,
  DISPATCH_SEARCH_LIMIT,
  DISPATCH_SEARCH_MIN_LENGTH,
} from './dispatch.constants'
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
  DispatchCandidatesBySearchApi,
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
  /** Phone-button presses over the last DISPATCH_CALLS_WINDOW_DAYS days */
  callCounts: Map<number, number>
  ratingById: Map<number, number>
  coverage: Map<number, { coveredUntil: Date | null }>
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
    private readonly routeMatrix: RouteMatrixService,
    private readonly routeQuota: RouteQuotaService,
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
          {
            tier: a.tier,
            isFeatured: a.isFeatured,
            isPartner: a.isPartner,
            rating: a.rating ?? null,
            driverName: a.driverName,
          },
          {
            tier: b.tier,
            isFeatured: b.isFeatured,
            isPartner: b.isPartner,
            rating: b.rating ?? null,
            driverName: b.driverName,
          },
        ),
      )

    return { place, items }
  }

  /**
   * Who is closest to a point the dispatcher typed or read off a map —
   * "search by coordinates", alongside `listCandidates`'s "search by place".
   *
   * Ranked by ROAD distance, in two steps — the same shape `/evakuator` uses,
   * and for the same reason:
   *
   * 1. **PostGIS picks the candidates.** One indexed query, free, and a good
   *    enough filter: a driver 90 km away in a straight line is never the
   *    road-nearest.
   * 2. **One matrix request ranks them.** Straight-line distance is a bad
   *    ranking — a driver 3 km away across a gorge is further by road than one
   *    6 km away on the highway, and in a country of gorges that is not a
   *    corner case. The dispatcher is about to tell somebody how long to wait.
   *
   * This screen used to stop at step 1, on the reasoning that it should not
   * compete with the visitor-facing search for one shared ORS budget. The
   * ranking it produced was wrong often enough that the saving was not worth
   * it; the budget is one count for both (`RouteQuotaService`), and a
   * dispatcher's handful of searches a day sits inside it comfortably.
   *
   * Degrades rather than fails: no budget left, a timeout, or a provider error
   * all leave the straight-line order standing and set `routed: false`, which
   * the screen says out loud. An unreachable routing service must never be the
   * reason a dispatcher cannot find a driver.
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
    if (distances.length === 0) return { latitude, longitude, items: [], routed: false }

    // Checked and consumed before the call goes out, not after: a request that
    // times out or returns a 5xx has still spent a slot against ORS's own
    // counter, so waiting to see whether it worked would let this keep trying
    // past the point ORS has already cut it off.
    let matrix: (RouteMatrixEntry | null)[] | null = null
    if (this.routeQuota.hasRemaining()) {
      this.routeQuota.consume()
      matrix = await this.routeMatrix.matrix(
        { latitude, longitude },
        distances.map((row) => ({ latitude: row.latitude, longitude: row.longitude })),
      )
    }

    // Per driver, not per response: ORS can answer for most destinations and
    // return null for one it cannot reach by road. That driver keeps their
    // straight-line number rather than being dropped — they are still somebody
    // the dispatcher can ring.
    const distanceById = new Map(
      distances.map((row, index) => [
        row.id,
        matrix?.[index]?.meters ?? row.straightLineMeters,
      ]),
    )

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
      // After the matrix step that order is the ROAD order, which is a
      // different order — this sort is what applies it.
      .sort((a, b) => a.distanceMeters - b.distanceMeters)

    return { latitude, longitude, items, routed: matrix !== null }
  }

  /**
   * Candidates for a driver's name, company name or phone.
   *
   * Deliberately the same pipeline as the other two searches — the same
   * `CANDIDATE_SELECT` rows, the same `gatherLookups`, the same
   * `candidateFields` — so a card found by name carries every fact a card
   * found by place does. The alternative, reusing the admin panel's own
   * driver list, was what this replaced: it answered with a different shape,
   * so the third tab quietly showed a thinner card than the first two.
   *
   * No tier and no distance: neither question has an answer without a place
   * or a point to ask it about.
   *
   * A term under `DISPATCH_SEARCH_MIN_LENGTH` returns nothing rather than
   * everything — one letter matches most of the table, and the cost of a card
   * is four grouped lookups.
   */
  async listCandidatesBySearch(search: string): Promise<DispatchCandidatesBySearchApi> {
    const term = search.trim()
    if (term.length < DISPATCH_SEARCH_MIN_LENGTH) return { items: [] }

    const trucks = await this.dispatchRepository.findCandidatesBySearch(term, DISPATCH_SEARCH_LIMIT)
    if (trucks.length === 0) return { items: [] }

    const lookups = await this.gatherLookups(trucks.map((truck) => truck.id))

    return { items: trucks.map((truck) => this.candidateFields(truck, lookups)) }
  }

  /**
   * Four reads, all grouped and all in parallel — this list is built while
   * somebody is on the phone, so the shape that matters is "one round trip
   * per FACT", never one per driver. Shared by both search modes so neither
   * one drifts into fetching a fact the other renders differently.
   */
  private async gatherLookups(ids: number[]): Promise<CandidateLookups> {
    const now = new Date()
    const callsSince = dispatchCallsWindowStart(now)

    const [stats, monthCounts, callCounts, ratings, coverage] = await Promise.all([
      this.dispatchRepository.statsFor(ids),
      this.dispatchRepository.countsSince(ids, startOfMonth(now)),
      this.dispatchRepository.phoneClicksSince(ids, callsSince),
      this.reviewsRepository.groupApprovedByTowTruckIds(ids),
      this.subscriptionsRepository.findCoverage(ids),
    ])

    return {
      stats,
      monthCounts,
      callCounts,
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
      slug: truck.slug,
      driverName: truck.driverName,
      companyName: truck.companyName ?? undefined,
      phone: truck.phone,
      vehicle: [truck.vehicleBrand, truck.vehicleModel].filter(Boolean).join(' '),
      vehicleType: truck.vehicleType,
      capacityTons: truck.capacityTons,
      wheelSkates: truck.wheelSkates,
      baseName: truck.locationName,
      // Through the window, not the raw flag: an expired placement must not
      // keep a driver at the top of the dispatcher's list, and it must not keep
      // them in the «Լավագույնները» filter either. Same rule as every public
      // read — see `isFeaturedNow`.
      isFeatured: isFeaturedNow(truck, lookups.now),
      // No window to apply — see schema.prisma's own note on the column.
      isPartner: truck.isPartner,
      isActive: truck.isActive,
      rating: rating === undefined ? undefined : Number(rating.toFixed(1)),
      subscriptionStatus: derivePaymentStatus(lookups.coverage.get(truck.id)?.coveredUntil ?? null),
      callsRecent: lookups.callCounts.get(truck.id) ?? 0,
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
