import { Injectable } from '@nestjs/common'
import { assertWithinArmenia } from '../common/coordinates'
import { TowTrucksService } from '../tow-trucks/tow-trucks.service'
import { NearestCacheService } from './nearest-cache.service'
import { NearestQuotaService } from './nearest-quota.service'
import {
  NEAREST_CANDIDATE_LIMIT,
  NEAREST_RADIUS_METERS,
  NEAREST_RESULT_LIMIT,
} from './nearest.constants'
import { NearestRepository } from './nearest.repository'
import type { NearestSearchApi, NearestTowTruckApi } from './nearest.types'
import { RouteMatrixService, type RouteMatrixEntry } from './route-matrix.service'

/**
 * "Which drivers can reach me, and how far away are they."
 *
 * Two steps, in this order and for this reason:
 *
 * 1. **PostGIS picks the candidates.** Straight-line distance is free (one
 *    indexed query) and is a good enough *filter* — a driver 90 km away in a
 *    straight line is never the road-nearest.
 * 2. **One matrix request ranks them.** Straight-line distance is a bad
 *    *ranking*: a driver 3 km away across a gorge is further by road than one
 *    6 km away on the highway. That is the whole reason step 2 exists, and the
 *    reason step 1 hands over more candidates (25) than the visitor will see
 *    (10) — reordering can only be correct if there is something to reorder.
 *
 * Everything the visitor's position touches lives in this call stack. It is
 * never written to the database, and the only place it persists at all is the
 * five-minute cache key, rounded to ~110 m (see NearestCacheService).
 */
@Injectable()
export class NearestService {
  constructor(
    private readonly repository: NearestRepository,
    private readonly towTrucksService: TowTrucksService,
    private readonly routeMatrix: RouteMatrixService,
    private readonly cache: NearestCacheService,
    private readonly quota: NearestQuotaService,
  ) {}

  /**
   * @param skipRouting The visitor has asked for straight-line distances only
   *   — they have spent today's allowance of detailed searches, so the search
   *   still runs (PostGIS costs nothing) but buys no road data. Trusted
   *   without corroboration because it can only ask for *less*; see
   *   `FindNearestDto.skipRouting`.
   */
  async findNearest(
    latitude: number,
    longitude: number,
    skipRouting = false,
  ): Promise<NearestSearchApi> {
    // Same geography rule the drivers' own coordinates go through, applied to
    // the visitor's. A browser reporting a position outside Armenia is either
    // someone genuinely abroad or a spoofed payload; neither has an answer on
    // this platform, and both are cheaper to reject than to route.
    assertWithinArmenia(latitude, longitude)

    // A routed answer already in the cache satisfies BOTH kinds of request: it
    // is strictly better than what a straight-line caller asked for and costs
    // nothing to hand over, so it is checked first regardless of the flag.
    const routedCached = this.cache.get(this.cache.buildKey(latitude, longitude))
    if (routedCached) return routedCached

    const cacheKey = this.cache.buildKey(latitude, longitude, !skipRouting)
    // Only reached when skipRouting is set — the routed key was just missed
    // above — but written generally so the two paths cannot diverge.
    if (skipRouting) {
      const plainCached = this.cache.get(cacheKey)
      if (plainCached) return plainCached
    }

    const result = await this.search(latitude, longitude, !skipRouting)

    // Empty results are cached too, on purpose: "nobody near this village" is a
    // stable answer for the next five minutes, and it is exactly the query a
    // bored visitor repeats. Not caching it would make the cheapest response the
    // one that always costs a full search.
    this.cache.set(cacheKey, result)
    return result
  }

  private async search(
    latitude: number,
    longitude: number,
    allowRouting: boolean,
  ): Promise<NearestSearchApi> {
    const candidates = await this.repository.findNearestCandidates(
      latitude,
      longitude,
      NEAREST_RADIUS_METERS,
      NEAREST_CANDIDATE_LIMIT,
    )
    if (candidates.length === 0) return { results: [], routed: false }

    // Cards come from the normal listing path, so they carry ratings and exactly
    // the columns every other listing publishes — see TowTrucksService.getCardsByIds.
    const cards = await this.towTrucksService.getCardsByIds(candidates.map((c) => c.id))
    const cardById = new Map(cards.map((card) => [card.id, card]))

    // A candidate whose card did not come back was deactivated between the two
    // queries. Dropping it here rather than rendering a hole is the same
    // check-at-both-ends habit the rest of the codebase uses for a row that can
    // change under a read.
    const routable = candidates.filter((candidate) => cardById.has(candidate.id))
    if (routable.length === 0) return { results: [], routed: false }

    // Two independent reasons to skip the routing step, and the same outcome
    // for both — the call is never attempted, never billed, and this candidate
    // set is ranked by straight-line distance instead, exactly as it is when a
    // matrix call fails:
    //
    //   `allowRouting` false  — the visitor asked for the cheap answer, having
    //                           spent today's 2 detailed searches.
    //   no budget remaining   — the platform's shared daily ORS budget is gone
    //                           (see NearestQuotaService for why that is one
    //                           global count and not a per-visitor one).
    let matrix: (RouteMatrixEntry | null)[] | null = null
    if (allowRouting && this.quota.hasRemaining()) {
      this.quota.consume()
      matrix = await this.routeMatrix.matrix(
        { latitude, longitude },
        routable.map((candidate) => ({ latitude: candidate.latitude, longitude: candidate.longitude })),
      )
    }

    const results: NearestTowTruckApi[] = routable.map((candidate, index) => {
      const road = matrix?.[index] ?? null
      return {
        towTruck: cardById.get(candidate.id)!,
        // Rounded to whole metres at the boundary: the API's contract is "how
        // far", not "to what precision PostGIS computed it", and an unrounded
        // 4123.847291839 in the JSON invites a consumer to render it.
        straightLineMeters: Math.round(candidate.straightLineMeters),
        ...(road ? { roadMeters: Math.round(road.meters), durationSeconds: Math.round(road.seconds) } : {}),
      }
    })

    // `routed` is true only when road data came back for at least one driver.
    // Deliberately not "the matrix call succeeded": a response where every entry
    // was unroutable is, to the person reading the page, the same thing as no
    // response at all, and the page must say «Ուղիղ գծով» in both cases.
    const routed = results.some((result) => result.roadMeters !== undefined)

    return { results: this.rank(results, routed).slice(0, NEAREST_RESULT_LIMIT), routed }
  }

  /**
   * Road distance when we have it, straight line when we do not — and never a
   * mixture.
   *
   * When `routed` is true, the handful of drivers ORS could not route to sort
   * last rather than interleaving by their straight-line figure. A list ordered
   * by two different measures is not ordered by anything, and the driver it
   * would push to the top is precisely the one whose real travel distance is
   * unknown.
   */
  private rank(results: NearestTowTruckApi[], routed: boolean): NearestTowTruckApi[] {
    return [...results].sort((a, b) => {
      if (routed) {
        const aRoad = a.roadMeters ?? Number.POSITIVE_INFINITY
        const bRoad = b.roadMeters ?? Number.POSITIVE_INFINITY
        if (aRoad !== bRoad) return aRoad - bRoad
      }
      return a.straightLineMeters - b.straightLineMeters
    })
  }
}
