import { IsBoolean } from 'class-validator'

/**
 * Admin-only bookkeeping — see TowTruck.lastPaymentAt. `paid: true` stamps
 * `lastPaymentAt` with the current instant; `paid: false` clears it, for
 * correcting a mistaken click rather than leaving a stale date that would
 * otherwise keep reading as "paid" for the rest of the calendar month.
 */
export class SetTowTruckPaymentDto {
  @IsBoolean()
  paid!: boolean
}
