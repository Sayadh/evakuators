import { IsBoolean } from 'class-validator'

/**
 * Start billing this driver, or stop.
 *
 * A boolean and no date, deliberately. The deadline is always
 * `PAYMENT_DUE_SOON_WITHIN_DAYS` ahead, because that constant is what puts the
 * driver into `due-soon` on the press and keeps them there until it passes —
 * a date chosen by hand could land anywhere, including far enough out that the
 * driver is told their subscription is active when they have never had one.
 *
 * Letting an admin pick the date is a real feature, not a missing one; it just
 * needs the `paid` copy fixed first. Until then the honest API is the one that
 * cannot express the broken state.
 */
export class SetPaymentDueDto {
  @IsBoolean()
  due!: boolean
}
