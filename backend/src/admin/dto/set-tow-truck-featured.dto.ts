import { Type } from 'class-transformer'
import { IsBoolean, IsInt, Max, Min, ValidateIf } from 'class-validator'
import { FEATURED_MAX_DAYS, FEATURED_MIN_DAYS } from '../../tow-trucks/featured'

/**
 * Granting or revoking a paid top placement.
 *
 * `days` is required when granting and refused when revoking — a duration on a
 * revoke is a caller that has misunderstood what it is doing, and accepting it
 * silently would leave an end date on a row whose flag is false. The global
 * `ValidationPipe` runs `forbidNonWhitelisted`, so the extra property is a 400
 * rather than a shrug.
 *
 * The bounds are the product's, not a sanity check: see `FEATURED_MAX_DAYS`.
 */
export class SetTowTruckFeaturedDto {
  @IsBoolean()
  isFeatured!: boolean

  @ValidateIf((dto: SetTowTruckFeaturedDto) => dto.isFeatured)
  @Type(() => Number)
  @IsInt({ message: 'Օրերի քանակը պետք է լինի ամբողջ թիվ' })
  @Min(FEATURED_MIN_DAYS, { message: `Նվազագույնը ${FEATURED_MIN_DAYS} օր` })
  @Max(FEATURED_MAX_DAYS, { message: `Առավելագույնը ${FEATURED_MAX_DAYS} օր` })
  days?: number
}
