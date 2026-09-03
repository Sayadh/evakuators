import { SubscriptionPaymentStatus } from '@prisma/client'
import { IsIn } from 'class-validator'

/** The only two decisions an admin can make about a request a driver has made */
export const DECIDABLE_STATUSES = [
  SubscriptionPaymentStatus.PAID,
  SubscriptionPaymentStatus.CANCELLED,
] as const

export type DecidableStatus = (typeof DECIDABLE_STATUSES)[number]

/**
 * Confirm («the money arrived») or cancel («it never did») one pending
 * request.
 *
 * FAILED is deliberately not offered: it means the payment provider refused,
 * which is a fact only that provider can report — an admin looking at a bank
 * statement is saying "no money came", which is CANCELLED.
 */
export class DecideSubscriptionPaymentDto {
  @IsIn(DECIDABLE_STATUSES, { message: 'Թույլատրելի արժեքներն են՝ PAID կամ CANCELLED' })
  status!: DecidableStatus
}
