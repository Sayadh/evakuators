import { IsBoolean } from 'class-validator'

/**
 * Toggle "our driver" on or off.
 *
 * One boolean and nothing else, unlike `SetTowTruckFeaturedDto`, and the
 * difference is the point: a placement is bought for a number of days, so it
 * needs one. This is a standing relationship — it starts when the operator
 * says so and ends when they say so, and a duration attached to it would be a
 * caller that has confused the two.
 */
export class SetTowTruckPartnerDto {
  @IsBoolean()
  isPartner!: boolean
}
