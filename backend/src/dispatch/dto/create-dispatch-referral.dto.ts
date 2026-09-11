import { IsIn, IsInt, IsPositive, IsString, Length } from 'class-validator'
import type { DispatchLocationType } from '../dispatch-ranking'

export const DISPATCH_LOCATION_TYPES: readonly DispatchLocationType[] = [
  'city',
  'district',
  'region',
  'route',
]

/**
 * `DispatchLocationType` plus `'coordinates'` — the one case that type
 * deliberately excludes (see its own doc comment: it is a MANUAL SYNC POINT
 * with `serviceAreas`/`service-area.dto.ts`, and a raw coordinate is not a
 * place a driver can declare coverage of). A referral's `locationType` has no
 * such constraint — nothing reads it back for matching, `schema.prisma` stores
 * it as a plain `String` column — so it is free to log the fifth, coordinate-
 * search case without touching the type every place-matching function shares.
 */
export type DispatchReferralLocationType = DispatchLocationType | 'coordinates'

export const DISPATCH_REFERRAL_LOCATION_TYPES: readonly DispatchReferralLocationType[] = [
  ...DISPATCH_LOCATION_TYPES,
  'coordinates',
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
 *
 * `locationType` accepts `'coordinates'` in addition to the four place kinds,
 * for a referral logged from the coordinate-search screen — see
 * `DispatchReferralLocationType` above.
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

  @IsIn(DISPATCH_REFERRAL_LOCATION_TYPES, { message: 'Անհայտ տեղանքի տեսակ' })
  locationType!: DispatchReferralLocationType
}
