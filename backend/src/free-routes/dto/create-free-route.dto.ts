import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateFreeRouteDto {
  /** Region slug from frontend static data */
  @IsString()
  @MaxLength(40)
  startRegionSlug!: string

  /** City/district slug from frontend static data */
  @IsString()
  @MaxLength(40)
  startCitySlug!: string

  @IsString()
  @MaxLength(40)
  endRegionSlug!: string

  @IsString()
  @MaxLength(40)
  endCitySlug!: string

  /** ISO 8601 datetime — frontend combines the day + time pickers before sending. Must be in the future. */
  @IsISO8601()
  departureAt!: string

  /**
   * ISO 8601 datetime — estimated arrival at the destination. Must be after
   * `departureAt`; see `FreeRoutesService.parseEstimatedArrivalAt`. Together
   * with `departureAt` this is the range the public card shows, and it is
   * what now decides the route's auto-expiry (see schema.prisma's own
   * comment on this column).
   */
  @IsISO8601()
  estimatedArrivalAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string
}
