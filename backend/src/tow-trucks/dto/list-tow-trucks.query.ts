import { Transform } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { TOW_TRUCK_LIST_MAX_LIMIT, TOW_TRUCK_LISTING_AVOID_LIMIT } from '../tow-trucks.constants'

export class ListTowTrucksQuery {
  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  district?: string

  @IsOptional()
  @IsString()
  region?: string

  /** Comma-separated city slugs of the region (static data lives in the frontend) */
  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    value
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean),
  )
  @IsString({ each: true })
  regionCities?: string[]

  /**
   * A road corridor slug («garni-geghard»). Matched EXACTLY against
   * `serviceAreas`, with no city fallback: a zone is not a settlement, so
   * picking one must return the drivers who chose that corridor and nobody
   * else. See TowTrucksRepository.buildWhere.
   */
  @IsOptional()
  @IsString()
  zone?: string

  /**
   * Comma-separated zone slugs of the region, alongside `regionCities`. Sent
   * for the same reason: the backend has no geography and cannot know which
   * corridors belong to which marz. Without it a driver who covers only a
   * corridor would be missing from their own marz's listing.
   */
  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    value
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean),
  )
  @IsString({ each: true })
  regionZones?: string[]

  @IsOptional()
  @IsBoolean()
  yerevan?: boolean

  /**
   * A `VehicleType` slug — powers the two vehicle-type landing pages
   * (`/manipulator`, `/tsanr-tehnika`).
   *
   * Deliberately **not** `@IsIn([...])`: the vehicle-type taxonomy lives in the
   * frontend (`frontend/constants/vehicles.ts`) and the backend stores
   * `vehicleType` as an opaque string — see CLAUDE.md § "Core architectural
   * decision". Listing the members here would be a fourth copy to keep in sync,
   * and an unknown slug already answers correctly: no truck matches, so the
   * page renders its empty state.
   *
   * `manipulator` is the one value the backend does understand structurally,
   * because it does not mean only `vehicleType = 'manipulator'` — see
   * `TowTrucksRepository.buildWhere` and `vehicle-types.ts`.
   *
   * Composes with the geography filters rather than replacing them, so
   * `?region=kotayk&vehicleType=heavy-duty` is a valid question even though no
   * page asks it yet.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleType?: string

  /**
   * Omitted means TOW_TRUCK_LIST_DEFAULT_LIMIT, not "everything" — an
   * unfiltered `GET /tow-trucks` can no longer make the database serialise the
   * entire fleet into one response. See tow-trucks.constants.ts.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TOW_TRUCK_LIST_MAX_LIMIT)
  limit?: number

  /**
   * Exists so a consumer that genuinely needs every truck can page through the
   * cap instead of being silently truncated by it — the sitemap route does
   * exactly that. The browse pages never set it: they are filtered by geography
   * and fit in one response.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number

  /**
   * The random number this listing's order is built from — see
   * `listing-order.ts`.
   *
   * Supplied by the caller rather than rolled here, and that is the whole
   * design: the page that asks mints ONE number per visit and reuses it, so
   * walking from a town to a driver and back does not reshuffle the list under
   * somebody who was reading it. A seed invented per request would make the
   * order unstable in exactly the way a visitor notices.
   *
   * Omitted means no ordering at all: every other consumer of this endpoint —
   * the marz pages, the vehicle-type pages, the sitemap — gets the database's
   * own order, untouched. The two search pages are the only ones that ask.
   */
  @IsOptional()
  @Transform(({ value }: { value: string }) => Number(value))
  @IsInt()
  seed?: number

  /**
   * The ids, in order, this visitor was shown last time on this same listing.
   *
   * The guarantee it buys: nobody who COULD have moved stands where they stood
   * before. Without it a shuffle repeats a position about a third of the time,
   * and the driver it repeats for reads that as "the order never changes".
   *
   * Capped, because this travels in a URL. The first screenful is the part
   * anybody notices repeating — see `TOW_TRUCK_LISTING_AVOID_LIMIT`.
   */
  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    value
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id))
      .slice(0, TOW_TRUCK_LISTING_AVOID_LIMIT),
  )
  @IsInt({ each: true })
  avoid?: number[]
}
