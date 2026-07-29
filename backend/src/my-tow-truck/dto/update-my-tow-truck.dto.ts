import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { WORKING_HOURS_PATTERN } from '../../registration/dto/create-registration.dto'

/**
 * Only the fields a driver may change about their own listing.
 * Slug, vehicle facts, base location and the primary (login) phone stay
 * admin-only — changing those needs a moderation eye.
 */
export class UpdateMyTowTruckDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  secondaryPhone?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  telegram?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  services?: string[]

  /**
   * Fully optional — a driver may leave both 24/7 unselected and this unset.
   * Built from two <input type="time"> fields on the frontend when present —
   * format enforced here too, in case of a direct API call.
   */
  @IsOptional()
  @IsString()
  @Matches(WORKING_HOURS_PATTERN, {
    message: 'Աշխատանքային ժամերը սխալ ձևաչափով են',
  })
  workingHoursText?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCityCallout?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  pricePerKm?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  priceWaitingPerHour?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  priceNightSurchargePercent?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  priceExtraLoading?: number

  /**
   * Omit the field entirely to leave the photos untouched. Sending it means
   * "this is now the full list", so an empty array would wipe every photo —
   * and a listing with no photo renders a broken image on the card, the
   * profile gallery and the og:image. Registration already requires at least
   * one (see CreateRegistrationDto.imageIds); a profile must not be able to
   * drop below that afterwards.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Պրոֆիլը պետք է ունենա առնվազն 1 նկար' })
  @ArrayMaxSize(6, { message: 'Նկարների առավելագույն քանակը 6 է' })
  @IsInt({ each: true })
  imageIds?: number[]
}
