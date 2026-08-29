/**
 * "Has this driver paid" — a monthly-recurring, admin-only bookkeeping
 * status derived entirely from `TowTruck.lastPaymentAt`. See
 * `AdminService.setTowTruckPayment` for how a payment is recorded, and
 * `TowTrucksRepository.setPayment`/`findAllForPayments` for the two queries
 * behind it.
 *
 * Four states, not a boolean, because "unpaid" (never marked) and "overdue"
 * (was marked, a month ago) read very differently to an admin even though
 * both currently fail to clear the driver: the first is a brand-new driver
 * nobody has billed yet, the second is someone who stopped paying.
 */
export type PaymentStatus = 'unpaid' | 'paid' | 'due-soon' | 'overdue'

/**
 * Fixed day counts, not "1 calendar month" via date arithmetic. Every month
 * is exactly `PAYMENT_OVERDUE_AFTER_DAYS` long for this purpose, so there is
 * no Jan-31-vs-Feb-28 edge case to reason about, and the two thresholds stay
 * exactly five days apart the way they were asked for: five days' warning
 * before a payment is formally overdue.
 */
export const PAYMENT_DUE_SOON_AFTER_DAYS = 25
export const PAYMENT_OVERDUE_AFTER_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `lastPaymentAt` plus "now" → which of the four states applies.
 *
 * Takes `now` as a parameter rather than reading the clock so this stays
 * testable without faking global time — same reasoning as `armeniaDateKey`
 * in `common/armenia-day.ts`.
 */
export function derivePaymentStatus(lastPaymentAt: Date | null, now: Date = new Date()): PaymentStatus {
  if (lastPaymentAt === null) return 'unpaid'

  const daysSince = Math.floor((now.getTime() - lastPaymentAt.getTime()) / DAY_MS)
  if (daysSince >= PAYMENT_OVERDUE_AFTER_DAYS) return 'overdue'
  if (daysSince >= PAYMENT_DUE_SOON_AFTER_DAYS) return 'due-soon'
  return 'paid'
}

/**
 * Admin-list shape for `/admin/payments` — deliberately narrow. That page
 * shows exactly three things (who, their phone, and whether they're paid up),
 * so this mirrors `AdminTowTruckSummary` in spirit but carries none of its
 * vehicle/coverage/Telegram fields; see `TowTrucksRepository.findAllForPayments`
 * for the matching lean query.
 */
export interface AdminPaymentSummary {
  id: number
  driverName: string
  companyName?: string
  phone: string
  lastPaymentAt?: string
  status: PaymentStatus
  /**
   * So the page can offer "deactivate" on an overdue row without a second
   * request, and hide it once there is nothing left to deactivate — see
   * AdminService.setTowTruckActive, which this page reuses as-is rather than
   * growing its own copy of the reactivation phone-conflict check.
   */
  isActive: boolean
}

export function toAdminPaymentSummary(truck: {
  id: number
  driverName: string
  companyName: string | null
  phone: string
  lastPaymentAt: Date | null
  isActive: boolean
}): AdminPaymentSummary {
  return {
    id: truck.id,
    driverName: truck.driverName,
    companyName: truck.companyName ?? undefined,
    phone: truck.phone,
    lastPaymentAt: truck.lastPaymentAt?.toISOString(),
    status: derivePaymentStatus(truck.lastPaymentAt),
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
