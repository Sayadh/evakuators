/**
 * "Is this driver paid up right now" — the one question the admin's
 * `/admin/payments` page exists to answer, now derived from **how long their
 * subscription runs** rather than from how many days ago someone marked a box.
 *
 * ## Why this replaced the day-count
 *
 * The previous rule lived in `admin/admin-payment.mapper.ts` and counted days
 * since `TowTruck.lastPaymentAt`: 25 days → due soon, 30 days → overdue. That
 * encoded a monthly cadence into the status itself, which was true while the
 * only thing being sold was one month at a time — and became wrong the moment
 * a driver could buy four. A 4-month subscriber would have read as **overdue
 * on day 30**, with an admin chasing (or deactivating) someone who had paid
 * for another three months.
 *
 * Taking the period's END means the rule stops caring how long a plan is: one
 * month, four, or anything sold later all work with no threshold to revisit.
 *
 * ## The four states are unchanged
 *
 * Deliberately — the admin page, its filter and its badges all speak this
 * vocabulary, and "unpaid" (nobody has ever billed them) still reads very
 * differently from "overdue" (they stopped paying) even though both fail to
 * clear the driver today.
 */
export type PaymentStatus = 'unpaid' | 'paid' | 'due-soon' | 'overdue'

/**
 * How long before a subscription runs out the admin starts seeing it as
 * "due soon".
 *
 * Five days, which is exactly the warning the old thresholds gave (25 vs 30) —
 * kept identical on purpose so the change of mechanism does not quietly become
 * a change of policy.
 */
export const PAYMENT_DUE_SOON_WITHIN_DAYS = 5

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `paidUntil` (the furthest `periodEnd` among this driver's PAID subscription
 * payments) plus "now" → which of the four states applies.
 *
 * `null` means no confirmed payment has ever covered them — a brand-new
 * driver, or one whose only payments are still PENDING. Both read as "unpaid":
 * a request nobody has confirmed has not paid for anything.
 *
 * Takes `now` as a parameter rather than reading the clock so this stays
 * testable without faking global time — same reasoning as `armeniaDateKey`
 * in `common/armenia-day.ts`.
 */
export function derivePaymentStatus(paidUntil: Date | null, now: Date = new Date()): PaymentStatus {
  if (paidUntil === null) return 'unpaid'

  const msLeft = paidUntil.getTime() - now.getTime()
  if (msLeft <= 0) return 'overdue'
  if (msLeft <= PAYMENT_DUE_SOON_WITHIN_DAYS * DAY_MS) return 'due-soon'
  return 'paid'
}

/**
 * Whether this driver's dashboard is locked down to the payment block alone.
 *
 * ## Only "overdue", deliberately — never "unpaid"
 *
 * Both fail to clear a driver today, but they are not the same person.
 * `overdue` had coverage and let it lapse. `unpaid` has NEVER been billed:
 * every driver the admin never got around to marking, plus every driver who
 * signed up before any of this existed. Locking that group would take the
 * whole platform's drivers offline on the deploy that ships this, for money
 * nobody ever asked them for.
 *
 * So the rule is "you had it and it ran out", and a driver who has never paid
 * keeps working until an admin records their first payment — from which point
 * the ordinary cycle applies to them like everyone else.
 *
 * Used in two places that must agree: the gate the dashboard renders, and
 * `SubscriptionActiveGuard`, which refuses the same driver's writes at the
 * API. A UI-only lock is a suggestion, not a paywall.
 */
export function isLockedOut(status: PaymentStatus): boolean {
  return status === 'overdue'
}
