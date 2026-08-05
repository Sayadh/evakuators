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
 * Two fields, both required, and `forbidNonWhitelisted` (main.ts) turns any
 * third one into a 400. There is nothing else to send, and nothing else this
 * endpoint would do with it.
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
}
