import { derivePaymentStatus, type PaymentStatus } from '../subscriptions/subscription-status'

/**
 * The `/admin/payments` list shape.
 *
 * The status itself is no longer decided here: it comes from
 * `subscriptions/subscription-status.ts`, off the END of the driver's paid
 * subscription period, because a day-count since "last marked" cannot express
 * a 4-month plan (that file's doc comment has the full argument). This module
 * is now just the projection the admin page reads.
 */
export { derivePaymentStatus }
export type { PaymentStatus }

/**
 * What the subscriptions side knows about one driver, as
 * `AdminService.listTowTruckPayments` assembles it.
 */
export interface DriverPaymentCoverage {
  /** `resolveCoveredUntil(paidThrough, paymentDueAt)` — money OR an admin's deadline */
  coveredUntil: Date | null
  /** Furthest `periodEnd` among this driver's PAID payments — `null` if none was ever confirmed */
  paidThrough: Date | null
  /** The deadline an admin set, if any. What tells the page a date is a promise, not a receipt. */
  paymentDueAt: Date | null
  /** `periodStart` of the most recently confirmed payment — the "last paid" column */
  lastPaidAt: Date | null
  /** Requests still waiting for someone to confirm or cancel them */
  pendingCount: number
}

/**
 * Admin-list shape for `/admin/payments` — deliberately narrow. That page
 * shows who, their phone, whether they're covered and until when, so this
 * mirrors `AdminTowTruckSummary` in spirit but carries none of its
 * vehicle/coverage/Telegram fields; see `TowTrucksRepository.findAllForPayments`
 * for the matching lean query.
 */
export interface AdminPaymentSummary {
  id: number
  driverName: string
  companyName?: string
  phone: string
  /**
   * ISO datetime — the date this driver is covered to, whichever source it
   * came from. Undefined means neither a confirmed payment nor a deadline.
   */
  paidUntil?: string
  /**
   * Set only when the date above is an admin's deadline rather than a
   * confirmed payment, so the row can say «Ժամկետ» instead of «Վճարված» — the
   * page must never show a promise in the colour it shows money.
   */
  paymentDueAt?: string
  /** ISO datetime — when the last confirmed payment's period began. */
  lastPaidAt?: string
  /**
   * Requests this driver has made that nobody has acted on. Shown as a badge
   * so the admin can see there is something to decide without opening the
   * pending queue — and deliberately NOT part of `status`: a request is not a
   * payment, and counting it as one is exactly how a driver ends up marked
   * paid for money that never arrived.
   */
  pendingCount: number
  status: PaymentStatus
  /**
   * So the page can offer "deactivate" on an overdue row without a second
   * request, and hide it once there is nothing left to deactivate — see
   * AdminService.setTowTruckActive, which this page reuses as-is rather than
   * growing its own copy of the reactivation phone-conflict check.
   */
  isActive: boolean
}

/**
 * `now` is a parameter for the same reason `derivePaymentStatus` takes one,
 * and this function reaching for the global clock was a real defect rather
 * than a style point: its test pinned the coverage dates to a frozen fixture
 * while the status underneath was judged against the wall clock, so the suite
 * passed on the day it was written and failed every day after — «paid» became
 * «due-soon» became «overdue» as the calendar walked past a hard-coded date.
 *
 * The caller also gains something real: one instant for a whole page, so 200
 * rows are judged against the same moment instead of 200 slightly different
 * ones — which is what makes the urgency sort below stable.
 */
export function toAdminPaymentSummary(
  truck: {
    id: number
    driverName: string
    companyName: string | null
    phone: string
    isActive: boolean
  },
  coverage: DriverPaymentCoverage,
  now: Date = new Date(),
): AdminPaymentSummary {
  return {
    id: truck.id,
    driverName: truck.driverName,
    companyName: truck.companyName ?? undefined,
    phone: truck.phone,
    paidUntil: coverage.coveredUntil?.toISOString(),
    // Only when the deadline is the thing doing the covering. A stale deadline
    // sitting behind live paid coverage is not what the row is about.
    paymentDueAt:
      coverage.paymentDueAt !== null && coverage.paymentDueAt === coverage.coveredUntil
        ? coverage.paymentDueAt.toISOString()
        : undefined,
    lastPaidAt: coverage.lastPaidAt?.toISOString(),
    pendingCount: coverage.pendingCount,
    status: derivePaymentStatus(coverage.coveredUntil, now),
    isActive: truck.isActive,
  }
}

/**
 * Most urgent first: every `overdue` row, then every `due-soon` row, then
 * everyone else together — `paid` and `unpaid` sort as one group because
 * neither needs the admin's attention the way the first two do, and ranking
 * a driver never billed above one who is simply current would invent an
 * urgency nobody asked for.
 *
 * A stable sort (`Array.prototype.sort` is specified to be one), so within
 * each group the alphabetical order `findAllForPayments` already queried in
 * survives untouched — the admin sees overdue names A→Z, then due-soon names
 * A→Z, then the rest A→Z, not three groups shuffled by insertion order.
 */
const STATUS_URGENCY: Record<PaymentStatus, number> = {
  overdue: 0,
  'due-soon': 1,
  unpaid: 2,
  paid: 2,
}

export function sortPaymentsByUrgency(summaries: AdminPaymentSummary[]): AdminPaymentSummary[] {
  return [...summaries].sort((a, b) => STATUS_URGENCY[a.status] - STATUS_URGENCY[b.status])
}
