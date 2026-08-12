import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { assertWithinArmenia } from '../common/coordinates'
import { TowTrucksService } from '../tow-trucks/tow-trucks.service'
import { NearestCacheService } from './nearest-cache.service'
import { NearestQuotaService } from './nearest-quota.service'
import {
  NEAREST_CANDIDATE_LIMIT,
  NEAREST_DAILY_LIMIT_CODE,
  NEAREST_RADIUS_METERS,
  NEAREST_RESULT_LIMIT,
} from './nearest.constants'
import { NearestRepository } from './nearest.repository'
import type { NearestSearchApi, NearestTowTruckApi } from './nearest.types'
import { RouteMatrixService } from './route-matrix.service'

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
   * @param clientIp Charged for the search — see NearestQuotaService for why
   *   this is an abuse ceiling on an external quota and emphatically not the
   *   visitor-facing "2 per day" rule, which lives in the browser.
   */
  async findNearest(
    latitude: number,
    longitude: number,
    clientIp: string,
  ): Promise<NearestSearchApi> {
    // Same geography rule the drivers' own coordinates go through, applied to
    // the visitor's. A browser reporting a position outside Armenia is either
    // someone genuinely abroad or a spoofed payload; neither has an answer on
    // this platform, and both are cheaper to reject than to route.
    assertWithinArmenia(latitude, longitude)

    const cacheKey = this.cache.buildKey(latitude, longitude)
    const cached = this.cache.get(cacheKey)
    // Deliberately before the quota check, not after: a cache hit costs no
    // external request, so refusing one would be taking a free answer away
    // from someone. The ceiling exists to bound upstream cost, and this
    // response has none.
    if (cached) return cached

    // Checked here — after the cache, before the work — so the counter tracks
    // searches performed rather than requests received.
    if (!this.quota.hasRemaining(clientIp)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          // Machine-readable, because the frontend shows different copy for
          // this than for the per-minute throttle's 429.
          code: NEAREST_DAILY_LIMIT_CODE,
          message:
            'Այս ցանցից այսօրվա որոնումների սահմանաչափը սպառվել է։ Խնդրում ենք փորձել վաղը, ' +
            'կամ օգտվել մարզերի և քաղաքների որոնումից։',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const result = await this.search(latitude, longitude)

    // Charged only once the search actually ran. A throw above this line —
    // PostGIS down, an unexpected error — costs the visitor nothing, which is
    // the right way round for a limit they cannot see or appeal.
    this.quota.consume(clientIp)

    // Empty results are cached too, on purpose: "nobody near this village" is a
    // stable answer for the next five minutes, and it is exactly the query a
    // bored visitor repeats. Not caching it would make the cheapest response the
    // one that always costs a full search.
    this.cache.set(cacheKey, result)
    return result
  }

  private async search(latitude: number, longitude: number): Promise<NearestSearchApi> {
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

    const matrix = await this.routeMatrix.matrix(
      { latitude, longitude },
      routable.map((candidate) => ({ latitude: candidate.latitude, longitude: candidate.longitude })),
    )

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
