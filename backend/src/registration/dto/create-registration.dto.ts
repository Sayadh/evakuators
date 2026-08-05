import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { IsLatitudeValue, IsLongitudeValue } from '../../common/coordinates'
import { IsArmenianPhone } from '../../common/phone'

const CURRENT_YEAR = new Date().getFullYear()

/** Built from two <input type="time"> values on the frontend, e.g. "09:00 – 20:00" */
export const WORKING_HOURS_PATTERN = /^\d{2}:\d{2}\s[–-]\s\d{2}:\d{2}$/

/**
 * Upper bound for every slug array a driver submits (services, cities).
 *
 * This is a payload guard and nothing else: it exists so an anonymous POST
 * cannot write an unbounded String[] into the database, not to encode how many
 * options the taxonomy happens to have. So it is deliberately set at roughly
 * double the largest reachable value rather than snugly above it.
 *
 * That distinction is not academic — it shipped as a bug. The first version of
 * this cap was 40, chosen as "comfortably above the whole taxonomy" without
 * counting it. The taxonomy is 45 slugs, and every category in the
 * registration form has a "select all" button, so any driver who ticked
 * everything was rejected with an untranslated
 * "services must contain no more than 40 elements" and could not register at
 * all. A cap sized to today's data turns tomorrow's new option into an outage.
 *
 * Current reachable maxima, for reference: services 45
 * (frontend/constants/services.ts), citySlugs 19 in practice and 58 in the
 * absolute worst case (46 cities + 12 districts).
 */
export const MAX_SLUG_ARRAY_SIZE = 100

/** One message for both arrays — a driver hitting either has the same problem */
export const TOO_MANY_MESSAGE = 'Ընտրված տարբերակները չափազանց շատ են'

export class CreateRegistrationDto {
  // Personal
  @IsString()
  @MinLength(2, { message: 'Անունը պետք է լինի առնվազն 2 նիշ' })
  @MaxLength(60)
  firstName!: string

  @IsString()
  @MinLength(2, { message: 'Ազգանունը պետք է լինի առնվազն 2 նիշ' })
  @MaxLength(60)
  lastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string

  /**
   * The main phone becomes `TowTruck.phone` at approval, which is the
   * driver-login key and is `@unique` — so it has to arrive canonical. See
   * `common/phone.ts` for why the rule is shared rather than repeated.
   */
  @IsArmenianPhone()
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
  @IsEmail({}, { message: 'Մուտքագրեք վավեր email հասցե' })
  email?: string

  // Vehicle
  @IsString()
  @MinLength(2, { message: 'Մուտքագրեք մեքենայի մակնիշը' })
  @MaxLength(60)
  vehicleBrand!: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleModel?: string

  @IsInt({ message: 'Մուտքագրեք մեքենայի արտադրության տարեթիվը' })
  @Min(1980, { message: 'Տարեթիվը պետք է լինի 1980-ից ավելի' })
  @Max(CURRENT_YEAR, { message: `Տարեթիվը չի կարող ավելի ուշ լինել քան ${CURRENT_YEAR}` })
  vehicleYear!: number

  /** VehicleType slug from frontend constants */
  @IsString()
  @MaxLength(40)
  vehicleType!: string

  @IsString()
  @MaxLength(20)
  capacityRange!: string

  /**
   * Two numbers, not a formatted string. The form collects them as two
   * separate number inputs (PlatformDimensionsInput.vue) precisely so there is
   * no format for a driver to get wrong and nothing to parse afterwards —
   * these carry straight through to TowTruck's identically-named columns at
   * approval.
   */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  platformLengthM?: number

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(30)
  platformWidthM?: number

  @IsBoolean()
  winch!: boolean

  @IsBoolean()
  manipulator!: boolean

  /** Wheel skates — for loading a vehicle with locked/non-rotating wheels */
  @IsBoolean()
  wheelSkates!: boolean

  /**
   * Fully optional — a driver may leave both 24/7 unselected and this unset.
   * When present, the frontend builds it from two <input type="time">
   * fields so the format is guaranteed there, but a direct API call could
   * still send anything, so the exact pattern is enforced here too.
   */
  @IsOptional()
  @IsString()
  @Matches(WORKING_HOURS_PATTERN, {
    message: 'Աշխատանքային ժամերը սխալ ձևաչափով են',
  })
  workingHoursText?: string

  // Areas — slugs reference frontend static data
  /** Up to 2 marzes — a driver covering e.g. Yerevan + Kotayk picks both */
  @IsArray()
  @ArrayMinSize(1, { message: 'Ընտրեք առնվազն մեկ մարզ' })
  @ArrayMaxSize(2, { message: 'Կարող եք ընտրել առավելագույնը 2 մարզ' })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  regionSlugs!: string[]

  /**
   * Bounded like every other slug array here — an unbounded one on a public,
   * unauthenticated endpoint is a free write into a String[] column that is
   * then rendered on the public profile.
   *
   * The cap is a payload guard, NOT a statement about the taxonomy, so it sits
   * far above anything reachable: today's real maximum is 19 (Yerevan's 12
   * districts plus the largest marz's 7 cities, with the 2-region cap above),
   * and even every city and district in the country at once is 58. See
   * MAX_SLUG_ARRAY_SIZE.
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'Ընտրեք առնվազն մեկ քաղաք/շրջան' })
  @ArrayMaxSize(MAX_SLUG_ARRAY_SIZE, { message: TOO_MANY_MESSAGE })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  citySlugs!: string[]

  // Services — ServiceType slugs
  /**
   * The full ServiceType taxonomy is 45 slugs, and every category in the form
   * has a "select all" button, so a driver ticking everything sends all 45.
   * See MAX_SLUG_ARRAY_SIZE for why the cap is not set anywhere near that.
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'Ընտրեք առնվազն մեկ ծառայություն' })
  @ArrayMaxSize(MAX_SLUG_ARRAY_SIZE, { message: TOO_MANY_MESSAGE })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  services!: string[]

  // Base parking coordinates — required for NEW registrations, even though the
  // columns themselves are nullable (see TowTruck.latitude in schema.prisma).
  // The two are not in conflict: the column has to tolerate every driver
  // approved before this feature existed, while the form has no reason to let a
  // new one through without the value the "nearest evacuator" feature is built
  // on. Requiring it here is what stops the gap from growing.
  //
  // Two numbers, not a "40.1792, 44.4991" string — the same call the platform
  // dimensions made when they stopped being free text (see platformLengthM
  // above). The frontend collects them in one box because that is the shape
  // Google Maps hands a driver, and splits them before submitting; the wire and
  // the database only ever see numbers. See docs/taxonomies.md § "ask for the
  // value, not the format".
  //
  // The Armenia bounds check deliberately does NOT live here — see
  // assertWithinArmenia in common/coordinates.ts for why it belongs in the
  // service instead.
  @IsLatitudeValue()
  latitude!: number

  @IsLongitudeValue()
  longitude!: number

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
