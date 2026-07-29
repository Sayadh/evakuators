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
