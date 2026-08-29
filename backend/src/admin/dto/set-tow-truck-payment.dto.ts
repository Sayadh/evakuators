import { IsBoolean, IsISO8601, ValidateIf } from 'class-validator'

/**
 * Admin-only bookkeeping — see TowTruck.lastPaymentAt.
 *
 * `paidAt` is chosen by hand, not defaulted to "the moment the admin clicks
 * the button" — a driver typically pays a few days before or after an admin
 * gets around to marking it, and `derivePaymentStatus`'s day-count is only
 * honest if `lastPaymentAt` is the real payment date, not the bookkeeping
 * date. `@ValidateIf` makes it required exactly when `paid: true` and
 * ignored (not validated) when `paid: false` clears a mistaken mark — there
 * is no date to choose when un-marking.
 */
export class SetTowTruckPaymentDto {
  @IsBoolean()
  paid!: boolean

  @ValidateIf((dto: SetTowTruckPaymentDto) => dto.paid)
  @IsISO8601()
  paidAt?: string
}
