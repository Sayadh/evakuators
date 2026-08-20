import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
 * Upper bound for every slug array in a driver's profile (services, cities).
 *
 * This is a payload guard and nothing else: it exists so an anonymous POST
 * cannot write an unbounded String[] into the database, not to encode how many
 * options the taxonomy happens to have. So it is deliberately set at roughly
 * double the largest reachable value rather than snugly above it.
 *
 * That distinction is not academic — it shipped as a bug. The first version of
 * this cap was 40, chosen as "comfortably above the whole taxonomy" without
 * counting it. The taxonomy was 45 slugs, and every category in the
 * registration form has a "select all" button, so any driver who ticked
 * everything was rejected with an untranslated
 * "services must contain no more than 40 elements" and could not register at
 * all. A cap sized to today's data turns tomorrow's new option into an outage.
 *
 * Current reachable maxima, for reference — and note the first number has moved
 * three times since, which is exactly the point: services **52**
 * (frontend/constants/services.ts; the specialist lists added eight slugs, and
 * `night-service` and `receipt-provided` were retired), citySlugs 19 in
 * practice and 58 in the absolute worst case (46 cities + 12 districts). No
 * driver can actually reach 52, since the specialist lists replace the general
 * ones rather than adding to them.
 */
export const MAX_SLUG_ARRAY_SIZE = 100

/** One message for both arrays — a driver hitting either has the same problem */
export const TOO_MANY_MESSAGE = 'Ընտրված տարբերակները չափազանց շատ են'

/**
 * Everything about a tow-truck profile that a **person answers**, as opposed to
 * something the platform assigns.
 *
 * ## Why this is a base class and not two parallel DTOs
 *
 * These fields are submitted twice, by two different people, at two different
 * moments:
 *
 * - a driver fills them in at `POST /registration-requests`
 *   (`CreateRegistrationDto`, which adds `imageIds`), and
 * - an admin reviews and **corrects** them at
 *   `POST /admin/registration-requests/:id/approve`
 *   (`ApproveRegistrationDto`, which adds the fields only the platform can
 *   supply: slug, exact capacity, base placement, service-area names).
 *
 * The approval endpoint used to accept only that second, admin-only group and
 * copy everything else straight off the stored request — so a typo a driver
 * made was published verbatim and could only be repaired afterwards, field by
 * field, through half a dozen separate PATCH endpoints. The review page now
 * shows the whole profile and submits the whole profile, which means the two
 * payloads have to carry the same fields with the same rules, forever.
 *
 * Keeping them in one class is the only version of that which cannot drift. A
 * field added here is immediately askable on both forms and validated
 * identically on both endpoints; a field added to one DTO by hand would be
 * silently missing from the other, and the failure mode is quiet — approval
 * would just stop carrying it, and the driver's answer would vanish at the
 * moment their profile goes live.
 *
 * The frontend mirror of this same rule is `RegistrationFormFields.vue`, one
 * component rendered by both `/register` and the admin review page. See
 * `docs/api-reference.md` § "Reviewing a registration".
 */
export class RegistrationProfileDto {
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
   *
   * Editable by the admin on the review page, which is why `approve()` runs its
   * uniqueness check against the value in the DTO rather than the one stored on
   * the request: correcting a mistyped number is one of the commonest reasons
   * to edit a request at all, and checking the wrong one would either reject a
   * fixed number or admit a duplicate.
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

  /**
   * The four specialist technical answers — «Մանիպուլյատոր» is asked the first
   * three, «Ծանր տեխնիկայի էվակուատոր» the third and fourth. Which questions a
   * given driver actually sees is decided entirely on the frontend
   * (`specialistSpecFieldsFor` in `frontend/constants/vehicles.ts`).
   *
   * All four are `@IsOptional()` here, including `maxLoadTons`, which the form
   * makes required for those two types. That is deliberate and it is the same
   * call `capacityRange`'s siblings make: this DTO is also what the ADMIN
   * review page submits, for requests filed before these questions existed and
   * for a moderator correcting a truck whose type they are changing. A
   * hard-required field would make every one of those unapprovable — and the
   * only value at risk is a specification the public profile simply omits when
   * it is missing.
   *
   * `capacityTons` never comes from here: `AdminService.approve` prefers
   * `maxLoadTons` when there is one and falls back to the band, so a specialist
   * truck filters on the figure its driver actually stated.
   */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(200)
  craneCapacityTons?: number

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(80)
  craneReachM?: number

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(200)
  maxLoadTons?: number

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(400)
  platformLoadHeightCm?: number

  @IsBoolean()
  winch!: boolean

  @IsBoolean()
  manipulator!: boolean

  /** Wheel skates — for loading a vehicle with locked/non-rotating wheels */
  @IsBoolean()
  wheelSkates!: boolean

  /**
   * The driver's claim to «Ծանր տեխնիկայի տեղափոխում», and the moderator's
   * verdict on it — the same field submitted twice, which is the whole point of
   * this base class.
   *
   * `@IsOptional()` rather than required, unlike its three sibling booleans:
   * those have been asked since the form existed, this one has not, so every
   * pending request in the queue predates it. Defaulted to `false` where it is
   * read, never here — a DTO default would make "the moderator unticked it"
   * indistinguishable from "an old client did not send it".
   *
   * `TowTruck.heavyEquipment` keeps meaning "what a moderator decided": nothing
   * a driver types here reaches a live profile without passing through this
   * page. See `backend/src/tow-trucks/vehicle-types.ts` for why that property
   * is the one that matters.
   */
  @IsOptional()
  @IsBoolean()
  heavyEquipment?: boolean

  /**
   * «Ամբողջ Հայաստան» — see `TowTruck.servesAllArmenia`.
   *
   * When true the coverage cap does not apply (`assertRegistrationAreasWithinLimit`
   * returns early) and `citySlugs` may be empty, because there is no list to
   * cap. `regionSlugs` and the base placement are unaffected: this says where a
   * driver will GO, and the base still says where they ARE.
   */
  @IsOptional()
  @IsBoolean()
  servesAllArmenia?: boolean

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
  /**
   * The marzes a driver covers — up to 2 for an ordinary evacuator, unlimited
   * for a crane truck or a machinery transporter.
   *
   * The `2` used to live here as `@ArrayMaxSize`. It moved into
   * `assertRegistrationAreasWithinLimit`, which is the only place that knows
   * *which* driver this is: the cap is a rule about a roadside evacuator (a
   * listing claiming everywhere is worth nothing to someone standing next to a
   * broken car) and it was never a rule about a manipulator driving to a
   * booked job in Syunik. A per-property decorator cannot see `vehicleType`,
   * so keeping it here would mean rejecting the very selection the specialist
   * form is built to offer.
   *
   * `ArrayMaxSize(MAX_SLUG_ARRAY_SIZE)` stays as the payload guard it always
   * was — see that constant for why a bound and a rule are different things.
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'Ընտրեք առնվազն մեկ մարզ' })
  @ArrayMaxSize(MAX_SLUG_ARRAY_SIZE, { message: TOO_MANY_MESSAGE })
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
  /**
   * `ArrayMinSize` is gone for the same reason `regionSlugs`' max did: a driver
   * who answered «Ամբողջ Հայաստան» has no city list to be non-empty, and
   * emptiness is only wrong for the drivers who were asked for one. The rule
   * moved to `assertRegistrationAreasWithinLimit`, which can see
   * `servesAllArmenia`.
   */
  @IsArray()
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

  // Base parking coordinates — OPTIONAL, like every other field a driver might
  // not have to hand at sign-up.
  //
  // They were required at first, on the reasoning that the "nearest evacuator"
  // feature is built on them and a mandatory field stops the gap from growing.
  // That reasoning had the cost backwards. The registration form is the only
  // way onto the platform, and the field asks a driver to copy a coordinate out
  // of Google Maps on a phone — the step most likely to defeat someone. A
  // registration abandoned there costs a whole driver; a missing coordinate
  // costs one row in one feature, and it is editable from the dashboard the
  // moment they are approved. Better an incomplete profile we can finish than
  // no profile.
  //
  // It also removed a worse outcome: while this was mandatory, the form told a
  // stuck driver to paste the EXAMPLE coordinate so they could finish, which
  // silently parked them in the centre of Yerevan and ranked them against
  // customers nowhere near. A blank is honest; a plausible wrong number is not.
  //
  // Both or neither — enforced in the services (RegistrationService and
  // AdminService.approve), not here, because it is a rule ABOUT the pair and a
  // per-property decorator cannot see its sibling.
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
  @IsOptional()
  @IsLatitudeValue()
  latitude?: number

  @IsOptional()
  @IsLongitudeValue()
  longitude?: number

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
}
