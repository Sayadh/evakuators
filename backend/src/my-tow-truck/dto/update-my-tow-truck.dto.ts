import { Type } from 'class-transformer'
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
  ValidateNested,
} from 'class-validator'
import { ServiceAreaDto } from '../../tow-trucks/dto/service-area.dto'
import {
  MAX_SLUG_ARRAY_SIZE,
  TOO_MANY_MESSAGE,
  WORKING_HOURS_PATTERN,
} from '../../registration/dto/create-registration.dto'

const CURRENT_YEAR = new Date().getFullYear()

/**
 * Everything a driver may change about their own listing.
 *
 * ## The boundary, and why it sits where it does
 *
 * The rule used to be "only contact details, description, services, hours,
 * prices and photos" — everything the driver stated at registration about
 * *the truck itself* was frozen after approval, and fixing a typo meant
 * registering again from scratch. That is now inverted: a driver owns the
 * facts about their own vehicle and coverage, and exactly two fields stay
 * admin-only, each for a concrete reason rather than caution:
 *
 * - **`slug`** — it is the public URL (`/tow-trucks/<slug>`). Letting a driver
 *   change it silently 404s every existing link and throws away whatever
 *   search ranking that URL had earned. There is no redirect table to soften
 *   that, so it needs a deliberate hand. See `docs/pages-and-routes.md`.
 * - **`phone`** — it is the driver-login lookup key (DriverAuthService finds
 *   the truck by it) and must stay unique across trucks. A driver editing it
 *   can lock themselves out of the account they are editing from, and can
 *   collide with someone else. That is why admins got
 *   `PATCH /admin/tow-trucks/:id/phone` instead.
 *
 * Both are still *shown* on the dashboard, read-only, so nothing a driver
 * entered at registration is invisible to them — they just point at support.
 *
 * ## Nothing here is applied directly any more
 *
 * This DTO used to describe a write. It now describes a **submission**: the
 * endpoint queues a diff and a moderator approves it, at which point
 * `MyTowTruckService.applyUpdate` runs this exact shape against the row. See
 * `docs/api-reference.md` § "Driver edits are moderated".
 *
 * That closed the gap this comment used to name out loud — vehicle facts and
 * service areas were self-service and never re-reviewed, so a driver could
 * raise their stated capacity or add coverage they do not serve and nothing
 * caught it. The note said the place to add re-moderation was here rather than
 * in the UI, and that is where it went.
 *
 * The practical consequence for anything added below: a new field must also be
 * added to `EDITABLE_PROFILE_FIELDS`
 * (`backend/src/profile-changes/profile-change-diff.ts`), or it will validate,
 * reach the queue, and be silently dropped from the diff.
 *
 * Every field is optional: this is a PATCH, and an omitted key means "leave it
 * alone". Only `companyName` distinguishes omitted from empty — see below.
 */
export class UpdateMyTowTruckDto {
  /**
   * Stored as one column, so it is edited as one field. `RegistrationRequest`
   * splits first/last name, but `AdminService.approve()` joins them on the way
   * in and nothing downstream ever needs the halves again.
   */
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Անուն Ազգանունը շատ կարճ է' })
  @MaxLength(120)
  driverName?: string

  /**
   * The one field where an empty string is meaningful rather than ignored:
   * it means "I have no company", and the service maps `''` to `null`.
   *
   * Without that, a driver who typed something into this optional box at
   * registration could never take it back out — and they do type into it.
   * Real case: the field was labelled «Կազմակերպության անուն (եթե կա)», a
   * driver read it as a question and answered «Չկա», and because
   * `companyName ?? driverName` only falls back on null, «Չկա» became their
   * display name on every card, the profile heading, the breadcrumb, the SEO
   * title and the schema.org business name.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string

  /**
   * These three, like `companyName` above, accept `''` as "remove this value" —
   * see MyTowTruckService's `clearable()`. Omitting the key still means "leave
   * it alone", so a PATCH that doesn't mention a field never touches it.
   */
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

  // ── Vehicle ───────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Մուտքագրեք մեքենայի մակնիշը' })
  @MaxLength(60)
  vehicleBrand?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicleModel?: string

  @IsOptional()
  @IsInt()
  @Min(1980, { message: 'Տարեթիվը պետք է լինի 1980-ից ավելի' })
  @Max(CURRENT_YEAR, { message: `Տարեթիվը չի կարող ավելի ուշ լինել քան ${CURRENT_YEAR}` })
  vehicleYear?: number

  /** VehicleType slug from frontend constants */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleType?: string

  /**
   * An exact float, not the band slug the registration form collects.
   * The driver still picks a band in the UI; the frontend converts it with
   * `representativeCapacityTons()` — the same function the admin approval flow
   * uses, so a self-edited truck and an approved one land on identical values
   * and keep matching the same capacity filter. See docs/taxonomies.md.
   */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  capacityTons?: number

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  platformLengthM?: number

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  platformWidthM?: number

  @IsOptional()
  @IsBoolean()
  winch?: boolean

  @IsOptional()
  @IsBoolean()
  manipulator?: boolean

  @IsOptional()
  @IsBoolean()
  wheelSkates?: boolean

  @IsOptional()
  @IsBoolean()
  doubleDeck?: boolean

  /**
   * The specialist technical answers — the same four columns registration
   * collects, editable here for the same reason everything else is: a field a
   * driver can be asked at sign-up and can never correct afterwards means the
   * only way to fix a typo is to register again (CLAUDE.md § "Registration and
   * the driver dashboard must offer the same fields").
   *
   * Ranges mirror `RegistrationProfileDto` exactly. Nothing here is required —
   * a driver switching FROM a specialist type back to `flatbed` sends the
   * whole form with these blank, and rejecting that would strand them on a
   * type they no longer drive.
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

  /**
   * «Ծանր տեխնիկայի տեղափոխում», proposed by the driver.
   *
   * Editable here and still not self-granted: a dashboard save does not write,
   * it QUEUES a diff that a moderator approves (`docs/api-reference.md` §
   * "Driver edits are moderated"). So `TowTruck.heavyEquipment` goes on meaning
   * "what a human decided" — the only thing that changed is who may propose it.
   * That is the property `backend/src/tow-trucks/vehicle-types.ts` argues for,
   * and it is preserved rather than traded away.
   */
  @IsOptional()
  @IsBoolean()
  heavyEquipment?: boolean

  /** «Ամբողջ Հայաստան» — see `TowTruck.servesAllArmenia` */
  @IsOptional()
  @IsBoolean()
  servesAllArmenia?: boolean

  // ── Listing content ───────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  description?: string

  /**
   * Bounded exactly like the registration DTO's `services`, and for the same
   * reason — a payload guard on a list a client controls. It IS re-moderated
   * now, but a cap that only a human enforces is not a cap. The number had the
   * same off-by-taxonomy bug there: at 40 it
   * rejected any driver who ticked all 45 services, which the form's
   * "select all" buttons make a single click away.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SLUG_ARRAY_SIZE, { message: TOO_MANY_MESSAGE })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
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

  // ── Coverage ──────────────────────────────────────────────────────────────

  /**
   * Free-text label for where the truck is usually parked ("Նոր Նորք").
   * Shown on cards and the profile; independent of the structural
   * citySlug/districtSlug placement below.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  locationName?: string

  /**
   * Full replacement list of served cities/districts, with names already
   * resolved — see ServiceAreaDto for why the name has to come from the
   * client. Sending it also requires sending the structural placement below,
   * because the two must describe the same geography; MyTowTruckService
   * rejects a partial combination rather than letting them drift.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Ընտրեք առնվազն մեկ քաղաք կամ շրջան' })
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaDto)
  serviceAreas?: ServiceAreaDto[]

  /**
   * The marzes the driver ticked — **for validating the coverage cap, not for
   * storage.** Nothing here is written to any column.
   *
   * The cap allows 3 places for one marz and 5 for two, and that distinction is
   * invisible in `serviceAreas` alone: five cities in Lori and five spread over
   * Lori + Armavir are the same typed list, and telling them apart would mean
   * resolving a city to its marz — geography the backend deliberately does not
   * have (CLAUDE.md). Yerevan needs no such help, because only Yerevan has
   * districts.
   *
   * Optional so that a client which omits it degrades to the two-marz budget —
   * still a correct bound, never rejecting a valid selection — rather than to a
   * hard failure. `regionSlug` above is a different thing entirely: that one is
   * the single stored browsing region.
   *
   * **This one value is asserted by the client and cannot be verified here**,
   * unlike the approval flow, which reads the marzes off the stored
   * registration request. A driver could claim two marzes to unlock 5 places
   * for a selection that is really one marz. That is accepted knowingly: the
   * hard limits still hold no matter what is claimed (2 whenever Yerevan is
   * present, 5 in absolute terms), the difference between 3 and 5 is a
   * listing-quality rule rather than a security boundary, and closing it would
   * mean teaching the backend which marz every city belongs to — the geography
   * this codebase deliberately keeps out (CLAUDE.md).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2, { message: 'Կարող եք ընտրել առավելագույնը 2 մարզ' })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  regionSlugs?: string[]

  /**
   * Best-effort structural placement, derived by the frontend from the first
   * service area (exactly as the admin approval flow derives it). Only one of
   * citySlug/districtSlug is ever set — a Yerevan district truck has no city,
   * and `regionSlug` stays unset for Yerevan because Yerevan is a
   * pseudo-region (see CLAUDE.md).
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  regionSlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  citySlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  districtSlug?: string

  // ── Pricing ───────────────────────────────────────────────────────────────

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
   * drop below that afterwards. Array order becomes gallery order.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Պրոֆիլը պետք է ունենա առնվազն 1 նկար' })
  @ArrayMaxSize(6, { message: 'Նկարների առավելագույն քանակը 6 է' })
  @IsInt({ each: true })
  imageIds?: number[]
}
