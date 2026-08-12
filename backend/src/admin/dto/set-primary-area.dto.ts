import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Sets an approved truck's **main area** — the one place it is based, as
 * opposed to the list of places it will drive to.
 *
 * ## Why this endpoint exists
 *
 * Approval used to *guess* the placement: it took the first served area that
 * was not a road corridor. That is a reasonable default and a bad decision, for
 * two reasons that only became visible once city pages started ranking
 * locally-based drivers first:
 *
 * - the "first" area is whatever order the driver happened to tick boxes in, so
 *   the guess was effectively arbitrary;
 * - and nothing could correct it afterwards. The driver's dashboard derives the
 *   placement the same way, so a wrong guess re-derived itself on every save.
 *
 * Now a moderator picks it explicitly, from a marz + settlement pair of selects
 * offering only the areas that driver actually serves, and this endpoint is how
 * that choice reaches an already-approved truck.
 *
 * ## `locationName` is composed by the client, and that is the established rule
 *
 * The label shown on cards is not the slug — it is «Վարդենիս» or «Վարդենիս,
 * գյուղ Շատվան», Armenian words the backend has no way to produce: it holds no
 * geography (CLAUDE.md) and cannot turn `vardenis` into «Վարդենիս». So the panel
 * composes the string and sends it, exactly as it already sends resolved
 * `ServiceAreaDto.name` values. Sending the raw slug here is the same failure
 * that once put English slugs on public profiles.
 *
 * The village half is free text on purpose. It is the case the select cannot
 * cover — a driver parked in a village that is not, and should not become, a
 * filterable place of its own. It affects only the label; `citySlug` is still
 * the town whose page they rank on.
 */
export class SetPrimaryAreaDto {
  /**
   * Exactly one of these two, checked in the service rather than here: a
   * class-validator rule expressive enough for "exactly one of" would still
   * have to be written twice (once per field) and would report the failure on
   * whichever field happened to be listed first.
   *
   * Both are verified against the truck's stored `serviceAreas` — see
   * `assertPlacementIsServed`, which also rejects a district sent as a city and
   * a road corridor sent as either.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  citySlug?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  districtSlug?: string

  /**
   * The marz the chosen city belongs to — resolved by the panel from the static
   * geography, since the backend cannot look it up. Omitted for a Yerevan
   * district, which has no marz (CLAUDE.md), and the service nulls the column
   * in that case rather than leaving the truck on the marz page it left.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  regionSlug?: string

  /**
   * The composed display label. Required: this is the only string the public
   * card and profile show for the truck's base, so an empty one would blank
   * «Հիմնական գտնվելու վայրը» on every listing the driver appears in.
   */
  @IsString()
  @MinLength(2, { message: 'Հիմնական տեղակայման անունը շատ կարճ է' })
  @MaxLength(80)
  locationName!: string
}
