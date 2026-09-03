import { IsIn } from 'class-validator'
import { SUBSCRIPTION_PLAN_CODES, type SubscriptionPlanCode } from '../subscription-plans'

export const UNKNOWN_PLAN_MESSAGE = 'Ընտրված փաթեթը գոյություն չունի'

/**
 * The entire request body for `POST /my/subscription-payments`: one plan code,
 * nothing else.
 *
 * ## What is deliberately absent
 *
 * The price, the number of months, the driver id and the payment status are
 * all decided by the server — from `subscription-plans.ts`, from
 * `subscription-period.ts` and from the JWT (`request.towTruckId`). A client
 * that sends any of them does not get them ignored: the global `ValidationPipe`
 * runs with `forbidNonWhitelisted: true` (see `main.ts`), so an extra property
 * REJECTS the request outright rather than being silently stripped. That is
 * the property worth having — a frontend that starts sending `amount` finds
 * out immediately instead of appearing to work while the server ignores it.
 *
 * Named `planId` rather than `planCode` because that is what the client calls
 * it; it carries the plan's code, which is also its id (see subscription-plans.ts).
 */
export class CreateSubscriptionPaymentDto {
  @IsIn(SUBSCRIPTION_PLAN_CODES, { message: UNKNOWN_PLAN_MESSAGE })
  planId!: SubscriptionPlanCode
}
