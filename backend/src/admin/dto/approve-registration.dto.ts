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
import { RegistrationProfileDto } from '../../registration/dto/registration-profile.dto'
import { ServiceAreaDto } from '../../tow-trucks/dto/service-area.dto'

/**
 * The profile a moderator approves — **as they last saw it on screen**, not as
 * the driver originally typed it.
 *
 * ## What changed, and why the whole shape moved
 *
 * This used to carry only the handful of facts a registration cannot contain
 * (latin slug, exact capacity, base placement), and `approve()` copied every
 * other column straight off the stored `RegistrationRequest`. That made the
 * moment of approval a pure yes/no: a moderator who spotted a misspelt surname,
 * a phone with a digit missing, or a driver who had ticked half the country as
 * their coverage had exactly two options — approve it wrong and then repair it
 * afterwards through a scattering of single-field PATCH endpoints, or reject a
 * legitimate driver and ask them to fill the whole form in again.
 *
 * It now extends `RegistrationProfileDto`, so it carries the entire profile.
 * The admin review page (`/admin/registrations/:id`) renders the registration
 * form pre-filled from the request, the moderator edits whatever needs editing,
 * and **what they submit is what gets created**. Approval stopped being a
 * verdict on a record and became the record.
 *
 * ## The stored request is deliberately left untouched
 *
 * Edits are not written back to `RegistrationRequest`. That row keeps the
 * driver's original submission verbatim, which is the only remaining evidence
 * of what was actually sent — useful when a driver later asks why their profile
 * says something they did not write, and impossible to reconstruct if approval
 * overwrote it. The request's `status` is the one thing approval changes.
 *
 * Two consequences worth stating, because both look like bugs otherwise:
 *
 * - There is no draft. Nothing is persisted until the moderator approves, so
 *   navigating away mid-review loses the edits — which is correct, since a
 *   half-corrected request is not a state anyone should be able to observe.
 * - Rejecting after editing discards the edits entirely. Also correct: a
 *   rejected request should read as what the driver sent.
 */
export class ApproveRegistrationDto extends RegistrationProfileDto {
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug must be kebab-case latin' })
  @MaxLength(80)
  slug!: string

  /**
   * The exact figure, resolved on the frontend from the `capacityRange` the
   * driver (or now the moderator) picked — see `representativeCapacityTons`.
   * The backend has no taxonomy of its own to resolve it with, which is the
   * same reason `serviceAreas` arrive with their names already attached.
   */
  @IsNumber()
  @Min(0.5)
  capacityTons!: number

  // No platform dimensions here: they are on RegistrationProfileDto with every
  // other answer, as the same two Float columns the TowTruck stores. They
  // briefly lived on this DTO, parsed client-side out of a free-text answer —
  // that whole detour disappeared when the registration form started asking for
  // two numbers instead of a formatted string.

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
   * The served road corridor the truck is based on, when it is based on one.
   *
   * **Validation-only, never stored** — see `SetPrimaryAreaDto.routeSlug` and
   * `assertPlacementIsServed` for the whole argument. In short: a corridor base
   * is an empty `citySlug`/`districtSlug` plus the corridor's name in
   * `locationName`, and this field is what tells the backend that emptiness was
   * a choice rather than an omission.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  routeSlug?: string

  /**
   * The truck's "best-effort" browsing region (see TowTruck.regionSlug in
   * schema.prisma) — null/omitted for Yerevan, since Yerevan trucks are
   * placed via `districtSlug` instead. Since a request can carry up to 2
   * regionSlugs, the backend cannot infer this on its own (it has no
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

  /**
   * The coverage list as areas with resolved Armenian names, which
   * `citySlugs` (inherited, bare slugs) cannot be — the backend stores these
   * verbatim because it has no geography to look a name up with.
   *
   * The two must describe the same set, and the review page builds this FROM
   * `citySlugs` for exactly that reason: there is one picker on screen, and
   * both fields are derived from it. `approve()` does not attempt to
   * cross-check them, because the check would only ever fire on a hand-crafted
   * request from an authenticated admin.
   */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaDto)
  serviceAreas!: ServiceAreaDto[]

  // `regionSlugs` is inherited, and IS read here — unlike before, when this DTO
  // deliberately omitted it and `approve()` took the driver's stored list
  // instead. That guard existed because the number decides which coverage
  // budget applies (3 areas for one marz, 5 for two), and a caller who could
  // assert "two marzes" could unlock the looser bound for a selection that is
  // really one.
  //
  // It no longer applies, for two reasons that both have to hold: the caller is
  // an authenticated admin rather than an anonymous form, and the marzes are
  // now something they can legitimately change on the review page. Reading the
  // stored list would mean an admin who narrowed a driver from two marzes to
  // one still got the two-marz budget — the guard would be measuring a
  // selection that no longer exists.
}
