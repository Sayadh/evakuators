import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '../config/configuration'
import { ROUTE_MATRIX_TIMEOUT_MS } from './nearest.constants'

/**
 * One origin, many destinations, one request.
 *
 * ## Why a matrix and not N route calls
 *
 * 25 candidates is 25 round trips if each is routed on its own — 25× the
 * latency, 25× the quota, and 25 chances for one of them to fail and leave a
 * half-answered page. A matrix service answers all of them in a single call,
 * which is also why the candidate count can be generous (see
 * NEAREST_CANDIDATE_LIMIT): the cost is the same at 5 destinations or 30.
 *
 * ## Why OpenRouteService
 *
 * Free API key, up to 3,500 locations per matrix request — one visitor search
 * is one request, cached for five minutes, so the feature itself uses very
 * little of it. The key configured for this deployment is provisioned for
 * **500 requests/day** (not the larger figure sometimes advertised for the
 * free tier in general — tiers and keys vary, and 500 is the number that is
 * real for this platform). `NearestQuotaService` tracks calls against that
 * real number and degrades the search to straight-line distances before it
 * could ever be exceeded — see `NEAREST_ORS_DAILY_QUOTA`.
 *
 * The alternative that keeps getting suggested is OSRM's public demo server,
 * which is free and needs no key. Its own usage policy rules it out here: it is
 * for non-commercial use, offers no uptime guarantee, and can be withdrawn
 * without notice. Self-hosting OSRM removes those problems and adds an OSM
 * extract, a preprocessing pipeline and ~1 GB of RAM to maintain on the same VPS
 * that already runs everything else.
 *
 * ## Why this class is not an interface with implementations
 *
 * There is one provider. The seam that matters is `matrix()`'s signature —
 * origin + destinations in, metres and seconds out — and swapping ORS for
 * anything else is rewriting the body of one method. A provider interface with a
 * single implementation would be architecture for a decision nobody has made
 * yet.
 *
 * ## Failure is a normal outcome, not an exception
 *
 * Every failure path returns `null` rather than throwing: an unreachable routing
 * service must degrade the page to straight-line distances, never break it. The
 * caller treats `null` as "no road data" and says so on screen (see
 * NearestService and docs/nearest-search.md § Fallback).
 */

/** Metres and seconds for one destination, positionally aligned with the input */
export interface RouteMatrixEntry {
  meters: number
  seconds: number
}

interface OrsMatrixResponse {
  /** distances[originIndex][destinationIndex] — one origin, so one row */
  distances?: (number | null)[][]
  durations?: (number | null)[][]
}

@Injectable()
export class RouteMatrixService {
  private readonly logger = new Logger(RouteMatrixService.name)
  private readonly config: AppConfig['routeMatrix']

  constructor(configService: ConfigService) {
    this.config = configService.get<AppConfig['routeMatrix']>('routeMatrix')!
  }

  /**
   * Configured at all? When false the whole routing step is skipped without a
   * network call, and the search runs permanently in its own fallback mode.
   *
   * This is what lets the feature ship and be deployed before anyone has
   * obtained an API key — the page works, it just shows straight-line distances
   * and no times. Same "optional, off by default, no boot failure" shape as the
   * admin Telegram bot.
   */
  get isConfigured(): boolean {
    return this.config.apiKey.length > 0
  }

  /**
   * @param origin the visitor's position
   * @param destinations the candidate drivers' base positions, in order
   * @returns one entry per destination in the SAME order, or `null` if road
   *   data could not be obtained for this request at all. Individual entries can
   *   be `null` too — ORS returns a null distance for a destination it cannot
   *   route to (an island, a point off the road network), and that is a real
   *   per-driver answer rather than a failure of the request.
   */
  async matrix(
    origin: { latitude: number; longitude: number },
    destinations: { latitude: number; longitude: number }[],
  ): Promise<(RouteMatrixEntry | null)[] | null> {
    if (!this.isConfigured || destinations.length === 0) return null

    // ORS takes [longitude, latitude] — the same X-then-Y order as PostGIS, and
    // the same silent bug if reversed. Origin first, then every destination;
    // `sources`/`destinations` below refer to positions in this one array.
    const locations = [
      [origin.longitude, origin.latitude],
      ...destinations.map((d) => [d.longitude, d.latitude]),
    ]

    // AbortController, not just a fetch option: without it a routing service
    // that accepts the connection and then stalls would hold the visitor's
    // request open indefinitely. Past the timeout, straight-line distances shown
    // now beat road distances shown never.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ROUTE_MATRIX_TIMEOUT_MS)

    try {
      const response = await fetch(`${this.config.baseUrl}/v2/matrix/driving-car`, {
        method: 'POST',
        headers: {
          Authorization: this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locations,
          sources: [0],
          // Every index except the origin. Asking for the full N×N matrix would
          // compute driver-to-driver distances nobody looks at, for free only in
          // the sense that we would not be billed for them.
          destinations: destinations.map((_, index) => index + 1),
          metrics: ['distance', 'duration'],
          units: 'm',
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        // Logged with the status because the three that matter are diagnosable
        // from it alone: 403 is a bad or missing key, 429 is the daily quota,
        // 5xx is theirs. Body deliberately not logged — it echoes the request,
        // and the request contains the visitor's coordinates.
        this.logger.warn(
          `Route matrix request failed with HTTP ${response.status} — ` +
            'falling back to straight-line distances for this search',
        )
        return null
      }

      const data = (await response.json()) as OrsMatrixResponse
      const distanceRow = data.distances?.[0]
      const durationRow = data.durations?.[0]
      if (!distanceRow || !durationRow) {
        this.logger.warn('Route matrix response had no distance/duration row')
        return null
      }

      return destinations.map((_, index) => {
        const meters = distanceRow[index]
        const seconds = durationRow[index]
        // Both or neither. A distance without a duration would put a road
        // kilometre figure next to a missing time on one card only, which reads
        // as a rendering bug rather than as missing data.
        if (typeof meters !== 'number' || typeof seconds !== 'number') return null
        if (!Number.isFinite(meters) || !Number.isFinite(seconds)) return null
        return { meters, seconds }
      })
    } catch (error) {
      // Covers the abort above, DNS, TLS and a malformed body alike. All of them
      // mean the same thing to the caller, and none of them is worth failing a
      // visitor's search over.
      this.logger.warn(
        `Route matrix unavailable (${error instanceof Error ? error.name : 'unknown error'}) — ` +
          'falling back to straight-line distances',
      )
      return null
    } finally {
      clearTimeout(timeout)
    }
  }
}
