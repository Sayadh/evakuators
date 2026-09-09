import { IsIn, IsInt, IsPositive, IsString, Length } from 'class-validator'
import type { DispatchLocationType } from '../dispatch-ranking'

export const DISPATCH_LOCATION_TYPES: readonly DispatchLocationType[] = [
  'city',
  'district',
  'region',
  'route',
]

/**
 * Recording that a job was handed to a driver.
 *
 * The place travels in the body rather than being resolved from a slug,
 * because the taxonomy is static TypeScript and not a table — there is nothing
 * on the server to look `abovyan` up against. Storing the name the operator
 * saw is also what keeps last year's history readable after a rename (see
 * `DispatchReferral` in schema.prisma).
 *
 * `towTruckId` IS accepted from the caller here, unlike anywhere on the
 * driver's side — the caller is the dispatcher choosing somebody else, so there
 * is no session to derive it from. `AdminJwtGuard` is what makes that safe, and
 * the admin's own id still comes from the token, never from the body.
 */
export class CreateDispatchReferralDto {
  @IsInt()
  @IsPositive()
  towTruckId!: number

  @IsString()
  @Length(1, 100)
  locationSlug!: string

  @IsString()
  @Length(1, 200)
  locationName!: string

  @IsIn(DISPATCH_LOCATION_TYPES, { message: 'Անհայտ տեղանքի տեսակ' })
  locationType!: DispatchLocationType
}
