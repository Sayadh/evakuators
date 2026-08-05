import { Transform } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { TOW_TRUCK_LIST_MAX_LIMIT } from '../tow-trucks.constants'

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
}
