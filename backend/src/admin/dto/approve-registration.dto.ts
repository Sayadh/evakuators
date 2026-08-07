import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { ServiceAreaDto } from '../../tow-trucks/dto/service-area.dto'

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

  // No platform dimensions here: the request now stores them as the same two
  // Float columns the TowTruck does, so approve() copies them across like
  // winch/manipulator. They briefly lived on this DTO, parsed client-side out
  // of a free-text answer — that whole detour disappeared when the registration
  // form started asking for two numbers instead of a formatted string.

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

  // No `regionSlugs` here on purpose. The coverage cap needs to know whether
  // this is one marz or two, but the driver's own answer is already stored on
  // the RegistrationRequest — AdminService.approve() reads it from there. Asking
  // the client to repeat it would only create a way to assert two marzes and
  // unlock the looser budget for a selection that is really one.
}
