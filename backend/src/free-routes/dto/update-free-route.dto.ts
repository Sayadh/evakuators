import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'

/** Same fields as create, all optional — the driver edits whichever ones changed */
export class UpdateFreeRouteDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  startRegionSlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  startCitySlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endRegionSlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endCitySlug?: string

  @IsOptional()
  @IsISO8601()
  departureAt?: string

  /** See CreateFreeRouteDto's own comment — must be after the effective departureAt */
  @IsOptional()
  @IsISO8601()
  estimatedArrivalAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string
}
