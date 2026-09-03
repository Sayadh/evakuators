/**
 * Mirrors the backend's `SubscriptionPlanApi` / `SubscriptionPaymentApi`
 * (backend/src/subscriptions/subscription.types.ts). Like every other pair in
 * this monorepo, nothing enforces the match at compile time — the two projects
 * share no code (CLAUDE.md § "Monorepo layout").
 */

/** `id` is the plan's code — the value sent back as `planId`. See backend/src/subscriptions/subscription-plans.ts */
export type SubscriptionPlanCode = 'ONE_MONTH' | 'FOUR_MONTHS'

export interface SubscriptionPlan {
  id: SubscriptionPlanCode
  code: SubscriptionPlanCode
  title: string
  description: string
  durationMonths: number
  /** Whole drams */
  price: number
  currency: string
  features: string[]
}

/**
 * PENDING is the only status anything produces today: pressing «Վճարել»
 * records the intent to buy, no money moves, and nothing is granted — there
 * is no payment provider wired up yet.
 */
export type SubscriptionPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'

export interface SubscriptionPayment {
  id: number
  /** Echoed back by the API, which derived it from the JWT — the client never sends it */
  towTruckId: number
  planCode: string
  planTitle: string
  amount: number
  currency: string
  durationMonths: number
  /** ISO datetime */
  periodStart: string
  /** ISO datetime */
  periodEnd: string
  status: SubscriptionPaymentStatus
  /** ISO datetime */
  createdAt: string
}

/** Mirrors backend AdminPendingPaymentApi — one waiting request, with who made it */
export interface AdminPendingPayment extends SubscriptionPayment {
  driver: {
    id: number
    name: string
    companyName?: string
    phone: string
  }
}

/** Mirrors backend MySubscriptionStatusApi — what the dashboard decides its gate from */
export interface MySubscriptionStatus {
  status: 'unpaid' | 'paid' | 'due-soon' | 'overdue'
  /** ISO datetime — how far this driver is covered. Undefined = never confirmed. */
  paidUntil?: string
  /** Whole days until `paidUntil`, floored, never negative */
  daysLeft: number
  /** True when the dashboard must show nothing but the payment block */
  locked: boolean
  /**
   * Whether this driver is still listed on the site, and why not.
   *
   * Only `UNPAID` can ever be seen: every other deactivation is refused at
   * login, so that driver never holds a token to ask with.
   */
  isActive: boolean
  deactivationReason?: 'UNPAID' | 'OTHER'
}

/** Mirrors backend DeactivationReason — why an admin took a driver off the site */
export type DeactivationReason = 'UNPAID' | 'OTHER'
