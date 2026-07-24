import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

const CURRENT_YEAR = new Date().getFullYear()

export class CreateRegistrationDto {
  // Personal
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName!: string

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone!: string

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

  // Vehicle
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  vehicleBrand!: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleModel?: string

  @IsInt()
  @Min(1980)
  @Max(CURRENT_YEAR)
  vehicleYear!: number

  /** VehicleType slug from frontend constants */
  @IsString()
  @MaxLength(40)
  vehicleType!: string

  @IsString()
  @MaxLength(20)
  capacityRange!: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platformDimensions?: string

  @IsBoolean()
  winch!: boolean

  @IsBoolean()
  manipulator!: boolean

  // Areas — slugs reference frontend static data
  @IsString()
  @MaxLength(40)
  mainRegionSlug!: string

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  citySlugs!: string[]

  // Services — ServiceType slugs
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  services!: string[]

  // Pricing — optional
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

  /** Ids returned by POST /images (main image first) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  imageIds!: number[]
}
