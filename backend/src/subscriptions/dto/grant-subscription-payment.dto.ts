import { IsIn, IsISO8601, IsInt, IsOptional, IsPositive } from 'class-validator'
import { SUBSCRIPTION_PLAN_CODES, type SubscriptionPlanCode } from '../subscription-plans'
import { UNKNOWN_PLAN_MESSAGE } from './create-subscription-payment.dto'

/**
 * An admin recording a payment that arrived outside the platform — cash, a
 * bank transfer, whatever the driver actually did.
 *
 * Unlike the driver's own DTO this one names a driver, because the caller is
 * not that driver. The price and the duration are still the server's: an
 * admin picks a PLAN, not an amount, so the two ways money gets recorded can
 * never disagree about what a month costs.
 */
export class GrantSubscriptionPaymentDto {
  @IsInt()
  @IsPositive()
  towTruckId!: number

  @IsIn(SUBSCRIPTION_PLAN_CODES, { message: UNKNOWN_PLAN_MESSAGE })
  planId!: SubscriptionPlanCode

  /**
   * When the money actually arrived, chosen by hand — a driver typically pays
   * a few days before an admin gets around to recording it, and the coverage
   * window is only honest if it starts from the real date. Same reasoning the
   * old admin `paidAt` field had. Defaults to now when omitted.
   */
  @IsOptional()
  @IsISO8601()
  paidAt?: string
}
