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

  @IsIn(['city', 'district'])
  type!: 'city' | 'district'
}
