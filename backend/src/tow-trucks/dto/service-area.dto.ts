import { IsIn, IsString, MaxLength } from 'class-validator'

/**
 * One entry of `TowTruck.serviceAreas`.
 *
 * The backend has NO geography data — regions, cities and Yerevan districts
 * are static frontend constants (see CLAUDE.md § "Core architectural
 * decision"). So whoever sends a service area must also send its resolved
 * Armenian `name`; the backend stores exactly what it is given and can never
 * fill it in itself. Sending `name: slug` is the failure mode that once put
 * raw English slugs on public profiles — see docs/data-model.md.
 *
 * Shared deliberately: both the admin approval flow
 * (ApproveRegistrationDto, resolving names in pages/admin.vue) and the driver's
 * own dashboard (UpdateMyTowTruckDto, resolving them in ServiceAreaPicker) write
 * this same JSON shape. Two copies of the rule would be two places for it to
 * drift.
 */
export class ServiceAreaDto {
  @IsString()
  @MaxLength(40)
  slug!: string

  @IsString()
  @MaxLength(80)
  name!: string

  /**
   * `route` is a named road corridor («Գառնի–Գեղարդ»), not a settlement. It
   * matches on its own slug only — the backend never expands it to the places
   * along it, and there is nothing here to expand it with anyway.
   *
   * MANUAL SYNC POINT: must equal `LocationType` in
   * `frontend/types/enums.ts`. These values travel in both directions inside
   * `TowTruck.serviceAreas` and are matched literally by
   * `TowTrucksRepository.buildWhere`, so a mismatch silently returns nothing.
   */
  @IsIn(['city', 'district', 'route'])
  type!: 'city' | 'district' | 'route'
}
