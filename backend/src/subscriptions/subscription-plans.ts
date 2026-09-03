/**
 * The subscription plans a driver can buy, and the ONLY place their prices
 * and durations exist.
 *
 * ## Why constants and not a table
 *
 * Same rule as every other never-changing list in this project (CLAUDE.md
 * § "Core architectural decision: where does data live?"): static data lives
 * as typed constants, dynamic business data lives in Postgres. Two plans that
 * change roughly never are static. A `SubscriptionPlan` table would need a
 * migration, a seed, an admin CRUD screen and a "what if the row is missing"
 * branch on every read, to hold two rows nobody edits.
 *
 * The one thing that genuinely has to be server-side is the PRICE, and it is:
 * this file is backend-only, `CreateSubscriptionPaymentDto` accepts nothing
 * but a plan code, and `SubscriptionsService` reads amount and duration from
 * here. A client cannot state what it intends to pay — it can only name a
 * plan (see `docs/api-reference.md`).
 *
 * ## Why the code is also the id
 *
 * `ONE_MONTH` already identifies a plan uniquely, forever, and reads in a
 * database row and a Telegram message without a join. A uuid would identify
 * the same two constants with a value nobody can recognise.
 */

export type SubscriptionPlanCode = 'ONE_MONTH' | 'FOUR_MONTHS'

export interface SubscriptionPlan {
  code: SubscriptionPlanCode
  title: string
  description: string
  durationMonths: number
  /**
   * Whole drams. AMD's minor unit is not used in pricing here, and every other
   * price in this project is already an `Int` (see TowTruck's `price*` columns)
   * — so there is no scaling factor to remember anywhere.
   */
  price: number
  currency: 'AMD'
  /** Per-plan selling points, rendered as a list. Empty until there is something true to put here. */
  features: string[]
}

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = Object.freeze([
  Object.freeze({
    code: 'ONE_MONTH',
    title: '1 ամսվա բաժանորդագրություն',
    description: 'Հարթակի ամբողջական հասանելիություն 1 ամսով',
    durationMonths: 1,
    price: 3000,
    currency: 'AMD',
    features: [],
  }),
  Object.freeze({
    code: 'FOUR_MONTHS',
    title: '4 ամսվա բաժանորդագրություն',
    description: 'Հարթակի ամբողջական հասանելիություն 4 ամսով',
    durationMonths: 4,
    price: 10000,
    currency: 'AMD',
    features: [],
  }),
] as SubscriptionPlan[])

/** The accepted `planId` values — what `CreateSubscriptionPaymentDto` validates against. */
export const SUBSCRIPTION_PLAN_CODES: readonly SubscriptionPlanCode[] = SUBSCRIPTION_PLANS.map(
  (plan) => plan.code,
)

/**
 * Plan by code, or `undefined` for anything else.
 *
 * Takes a plain `string` on purpose: the DTO has already rejected unknown
 * codes by the time the service calls this, but a stored `planCode` read back
 * from an old row has no such guarantee — a plan retired later must not make
 * that row unreadable.
 */
export function findSubscriptionPlan(code: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((plan) => plan.code === code)
}
