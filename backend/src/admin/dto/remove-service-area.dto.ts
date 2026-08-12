import { IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Removing ONE served area from an already-approved tow truck, from the admin
 * panel.
 *
 * ## Why this carries a slug to delete rather than the new list
 *
 * Every other write path for `serviceAreas` (registration approval, the
 * driver's own dashboard) sends the **whole** list and replaces it. This one
 * deliberately does not, and the difference is the entire safety argument:
 *
 * - A "here is the new list" endpoint can also *grow* the list. This one
 *   structurally cannot — the server reads what is stored, drops one entry, and
 *   writes the remainder back. There is no request an admin could craft that
 *   adds coverage a driver never claimed, so nothing has to be validated to
 *   prevent it.
 * - It therefore never needs the coverage cap. See AdminService for why not
 *   applying the cap here is the point rather than an oversight.
 * - It is safe against a stale panel: the request names one area, so two admins
 *   removing two different areas from the same truck cannot clobber each
 *   other's work the way two full-list writes would.
 *
 * ## The placement fields
 *
 * `TowTruck.citySlug`/`districtSlug` is the structural placement the browsing
 * pages filter on, and it must always name one of the served areas. When the
 * removed area IS that placement, a replacement has to come from somewhere —
 * and it cannot be derived here, because picking one means knowing which
 * remaining slug is a real settlement and which is a road corridor, i.e.
 * geography, which this backend deliberately does not have (CLAUDE.md).
 *
 * So the panel resolves it and sends it, exactly as it already does for
 * approval and as the dashboard does for a driver's own save. It is *checked*
 * here though — see AdminService.removeTowTruckServiceArea, which rejects a
 * placement that is not among the areas that survive the removal. That check
 * needs no geography, only the stored list.
 *
 * When the removed area is not the placement, these three are ignored
 * outright: relocating a truck is not this endpoint's job, and letting a
 * removal quietly carry one would make the panel's "delete" button a second,
 * undocumented way to move a driver.
 */
export class RemoveServiceAreaDto {
  /** Slug of the area to drop. Must currently be in the truck's list. */
  @IsString()
  @MaxLength(40)
  slug!: string

  /**
   * Replacement placement — only read when the removal takes the current one
   * away, and then at most one of city/district may be given, matching the
   * columns' own either-or shape.
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
   * The marz the replacement city belongs to. Unset for a Yerevan district,
   * because Yerevan is a pseudo-region with no `regionSlug` (CLAUDE.md).
   *
   * Unlike the two above this one cannot be verified against the stored list —
   * the areas do not say which marz they are in. Same knowingly-accepted gap as
   * `UpdateMyTowTruckDto.regionSlugs`, and narrower: this endpoint is behind
   * `AdminJwtGuard`, and the value only affects which marz page the truck is
   * listed on, not what it may claim.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  regionSlug?: string
}
