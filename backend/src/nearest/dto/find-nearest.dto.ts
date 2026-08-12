import { IsBoolean, IsOptional } from 'class-validator'
import { IsLatitudeValue, IsLongitudeValue } from '../../common/coordinates'

/**
 * The visitor's own position, as reported by their browser.
 *
 * Validated with exactly the same two decorators a driver's stored coordinates
 * go through (`common/coordinates.ts`) — the numbers mean the same thing and
 * there is no reason for the platform to accept a shape from a visitor that it
 * would reject from a driver. `@IsNumber`'s defaults reject `NaN` and
 * `Infinity`, which matters more here than anywhere else: these values come
 * straight from an anonymous request body.
 *
 * `forbidNonWhitelisted` (main.ts) turns any field not declared here into a
 * 400, so the three below are the whole vocabulary of this endpoint.
 *
 * ## Why the whole thing is a POST body
 *
 * A GET would put the visitor's exact coordinates in the request line, where
 * nginx writes it to `access.log` and keeps it for as long as the log rotation
 * says — turning a value this codebase deliberately never stores into one that
 * is stored by default, on disk, next to a timestamp and an IP address. A body
 * is not logged. The endpoint is idempotent and cache-friendly in every other
 * respect, and the caching that matters happens server-side anyway
 * (NearestCacheService), so nothing is lost by not being a GET.
 */
export class FindNearestDto {
  @IsLatitudeValue()
  latitude!: number

  @IsLongitudeValue()
  longitude!: number

  /**
   * "Answer with straight-line distances only — do not call the routing
   * service for me."
   *
   * Sent by the frontend once a visitor has used today's allowance of
   * detailed searches (`NEAREST_DAILY_SEARCH_LIMIT`, 2/day per browser). Past
   * that the search keeps working — the PostGIS half costs nothing — it just
   * stops buying road distances and times out of the platform's shared daily
   * ORS budget.
   *
   * ## Why it is safe to let the client ask for this
   *
   * Every other "trust the client?" rule in this codebase exists because a
   * client could ask for *more* than it is entitled to. This flag can only ask
   * for **less**: a request carrying it is strictly cheaper to serve than one
   * without, and the worst a forged `true` achieves is a worse answer for the
   * forger. So it needs no server-side corroboration, unlike `restaurantId`
   * or any ownership identifier.
   *
   * The inverse is *not* true and must never be added — a client flag meaning
   * "route this one for me anyway" would let anyone spend the shared budget at
   * will, which is exactly what `NearestQuotaService` exists to bound.
   */
  @IsOptional()
  @IsBoolean({ message: 'skipRouting-ը պետք է լինի boolean' })
  skipRouting?: boolean
}
