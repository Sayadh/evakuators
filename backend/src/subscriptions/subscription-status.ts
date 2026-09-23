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
 *
 * It is also the grace «Դարձնել վճարովի» hands out, and that is one
 * constant rather than two by construction: setting the deadline exactly this
 * far ahead puts the driver into `due-soon` on the press and keeps them there
 * until it passes. Raise this and the grace widens with it; set the deadline
 * further ahead than this and the driver sits in `paid` — told their
 * subscription is active, when they have never had one.
 */
export const PAYMENT_DUE_SOON_WITHIN_DAYS = 5

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The two sources of coverage, reduced to the one date every other decision
 * reads.
 *
 * ## Why there are two
 *
 * `paidThrough` is money: the furthest `periodEnd` among this driver's PAID
 * payments. `paymentDueAt` is a promise: a deadline an admin set for a driver
 * who has never paid, so that the billing cycle can start for them at all.
 * They are stored apart on purpose — a promise written into the payments
 * table would be revenue that never arrived — and joined here, once, so that
 * no caller has to remember to do it.
 *
 * ## MAX, not a fallback
 *
 * `paidThrough ?? paymentDueAt` is the tempting one-liner and it is wrong.
 * A driver whose real coverage lapsed in August has a non-null `paidThrough`,
 * so the `??` would return August and leave them locked out no matter what
 * deadline an admin just gave them — the exact case the button exists for.
 * MAX is also what makes the reverse safe: a stale deadline sitting behind a
 * live subscription is simply ignored, so nothing has to clear it when a
 * driver finally pays.
 *
 * Both null — never paid, never billed — stays null, which `derivePaymentStatus`
 * reads as `unpaid`: the state that is deliberately never locked out.
 */
export function resolveCoveredUntil(
  paidThrough: Date | null,
  paymentDueAt: Date | null,
): Date | null {
  if (paidThrough === null) return paymentDueAt
  if (paymentDueAt === null) return paidThrough
  return paidThrough.getTime() >= paymentDueAt.getTime() ? paidThrough : paymentDueAt
}

/**
 * `coveredUntil` (see `resolveCoveredUntil`) plus "now" → which of the four
 * states applies.
 *
 * `null` means nothing covers them — no confirmed payment and no deadline an
 * admin set. A brand-new driver, one whose only payments are still PENDING,
 * and one nobody has started billing yet all read as "unpaid": a request
 * nobody has confirmed has not paid for anything, and a driver nobody has
 * billed owes nothing yet.
 *
 * Takes `now` as a parameter rather than reading the clock so this stays
 * testable without faking global time — same reasoning as `armeniaDateKey`
 * in `common/armenia-day.ts`.
 */
export function derivePaymentStatus(
  coveredUntil: Date | null,
  now: Date = new Date(),
): PaymentStatus {
  if (coveredUntil === null) return 'unpaid'

  const msLeft = coveredUntil.getTime() - now.getTime()
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
