import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

/**
 * The backend has no geography data of its own — regions/cities/districts
 * are static frontend constants (see schema.prisma). So the admin frontend
 * resolves each citySlug to its real Armenian name (it already does this
 * for display, via cityOrDistrictLabel()) and sends the resolved list here,
 * instead of the backend fabricating `name: slug`.
 */
class ServiceAreaDto {
  @IsString()
  @MaxLength(40)
  slug!: string

  @IsString()
  @MaxLength(80)
  name!: string

  @IsIn(['city', 'district'])
  type!: 'city' | 'district'
}

/**
 * Data the moderator provides on approval — things the request itself
 * cannot contain (latin slug, exact capacity, base location).
 */
export class ApproveRegistrationDto {
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug must be kebab-case latin' })
  @MaxLength(80)
  slug!: string

  @IsNumber()
  @Min(0.5)
  capacityTons!: number

  @IsString()
  @MaxLength(80)
  locationName!: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  citySlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  districtSlug?: string

  /**
   * The truck's "best-effort" browsing region (see TowTruck.regionSlug in
   * schema.prisma) — null/omitted for Yerevan, since Yerevan trucks are
   * placed via `districtSlug` instead. Now that a request can carry up to 2
   * regionSlugs, the backend can no longer infer this on its own (it has no
   * geography data — see CLAUDE.md), so the admin frontend resolves it from
   * whichever region the chosen citySlug/districtSlug actually belongs to,
   * the same way it already resolves citySlug/districtSlug and serviceAreas
   * names below.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  regionSlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaDto)
  serviceAreas!: ServiceAreaDto[]
}
