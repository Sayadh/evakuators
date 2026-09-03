/**
 * How long a plan buys, turned into two instants.
 *
 * Pure and directly tested, for the same reason `service-area-limits.ts` and
 * `driver-password.ts` are: it is the arithmetic a payment record's meaning
 * rests on, and it has exactly one interesting edge case (below) that a test
 * should pin rather than a reader should trust.
 *
 * ## The edge case
 *
 * "One month after 31 January" is not a date. JavaScript's own answer is 3
 * March (it overflows into the next month), which would quietly sell a driver
 * a subscription two or three days longer than the one they bought — every
 * 31st, every year. This clamps to the last day of the target month instead:
 * 31 January + 1 month = 28 February (29 in a leap year), the same answer a
 * bank statement gives.
 *
 * ## Why UTC
 *
 * The VPS runs UTC (see `common/armenia-day.ts`), and a subscription is a
 * DURATION, not a calendar-day label the way an analytics bucket is — so
 * unlike `armeniaDateKey`, nothing here needs the Armenia timezone: the end
 * instant lands at the same wall-clock time as the start in whatever zone it
 * is later read. Fixing the arithmetic to UTC just keeps it independent of
 * whatever timezone the process happens to run in, so a test and production
 * agree.
 */

/** Last day (1-31) of the month `monthsAhead` months after `from`, in UTC. */
function lastDayOfMonthAhead(from: Date, monthsAhead: number): number {
  // Day 0 of month N+1 is the last day of month N.
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + monthsAhead + 1, 0)).getUTCDate()
}

/**
 * `start` + `durationMonths`, clamped to the end of the target month.
 *
 * Exported on its own (rather than only through `subscriptionPeriod` below)
 * because the clamp is the part worth testing directly.
 */
export function addMonths(start: Date, durationMonths: number): Date {
  const end = new Date(start.getTime())
  const day = Math.min(start.getUTCDate(), lastDayOfMonthAhead(start, durationMonths))
  end.setUTCFullYear(start.getUTCFullYear(), start.getUTCMonth() + durationMonths, day)
  return end
}

export interface SubscriptionPeriod {
  start: Date
  end: Date
}

/**
 * The access window a plan bought now would cover.
 *
 * Takes the instant rather than reading the clock — same reason
 * `armeniaDateKey` does: a caller that needs to be testable can hand it one.
 *
 * Note this is what the driver is QUOTED, not proof of access. Nothing grants
 * anything until the payment's status is PAID, which nothing can set yet (see
 * `SubscriptionPaymentStatus` in schema.prisma).
 */
export function subscriptionPeriod(now: Date, durationMonths: number): SubscriptionPeriod {
  return { start: now, end: addMonths(now, durationMonths) }
}

/**
 * The period a payment should cover when it is CONFIRMED, given whatever the
 * driver is already covered until.
 *
 * ## Why confirmation recomputes rather than using the stored period
 *
 * The period written when a driver presses «Վճարել» is a quote (see
 * `SubscriptionPayment` in schema.prisma): nothing is granted by it. If an
 * admin confirms the money three days later, honouring that original window
 * would silently sell three days less than the plan says.
 *
 * ## Why it extends instead of restarting
 *
 * A driver who renews while still covered must not lose the remainder. So the
 * new period starts at whichever is later — the payment date, or the end of
 * the coverage they already have — and a renewal a month early is worth
 * exactly as much as one on the last day.
 */
export function renewalPeriod(
  paidUntil: Date | null,
  from: Date,
  durationMonths: number,
): SubscriptionPeriod {
  const start = paidUntil !== null && paidUntil.getTime() > from.getTime() ? paidUntil : from
  return { start, end: addMonths(start, durationMonths) }
}
