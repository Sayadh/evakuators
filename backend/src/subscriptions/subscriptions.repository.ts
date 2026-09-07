import { Injectable } from '@nestjs/common'
import { SubscriptionPaymentStatus, type SubscriptionPayment } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { SubscriptionPeriod } from './subscription-period'

/**
 * Upper bound on a driver's own payment history response. Nothing caps how
 * many times a driver may press «Վճարել», so without this one driver decides
 * how large their own dashboard response is — same reasoning as
 * `PUBLIC_FREE_ROUTES_LIMIT`, and the newest-first order below already puts
 * the rows anyone cares about at the top.
 */
const OWN_PAYMENTS_LIMIT = 50

/**
 * Upper bound on the admin's review list, for the same reason
 * `OWN_PAYMENTS_LIMIT` exists — except here the person deciding how large the
 * response gets is not the person receiving it.
 *
 * Only completed payments reach this list now, so it grows at the rate money
 * actually arrives rather than at the rate anyone can press a button. The cap
 * stays anyway: an admin who leaves it untouched for months should get a slow
 * page, not an unusable one. Oldest first, so the cap drops the newest rather
 * than hiding what has waited longest.
 */
const REVIEW_LIST_LIMIT = 200

/**
 * How long an unfinished payment sits before it is written off.
 *
 * A PENDING row is created the moment a driver presses «Վճարել», BEFORE they
 * are handed to the provider — the provider's first callback asks whether the
 * bill is real, so there has to be something to answer with. Most of those
 * rows are people who changed their mind on the provider's page, and nothing
 * ever cleaned them up.
 *
 * A day is far longer than any real payment takes, and far longer than Idram
 * retries a callback for, so cancelling at this age cannot race a payment
 * still in flight. And if a confirmation somehow arrives afterwards it is
 * still credited — `IdramService` accepts a callback for a CANCELLED bill on
 * purpose, because by then the money has moved.
 */
const ABANDONED_PENDING_TTL_MS = 24 * 60 * 60 * 1000

/** What one driver's confirmed payments add up to — see DriverPaymentCoverage in admin-payment.mapper.ts */
export interface PaymentCoverageRow {
  towTruckId: number
  paidUntil: Date | null
  lastPaidAt: Date | null
  pendingCount: number
}

/** A pending request with just enough of its driver to render the admin's queue */
export type PendingPaymentWithDriver = SubscriptionPayment & {
  towTruck: { id: number; driverName: string; companyName: string | null; phone: string }
}

export interface SubscriptionPaymentCreateData {
  planCode: string
  amount: number
  currency: string
  durationMonths: number
  periodStart: Date
  periodEnd: Date
  /**
   * Omitted by the driver's own flow, which must always land on the column
   * default (PENDING). Passed only by the admin's manual grant, which records
   * money that has already arrived — see AdminSubscriptionsService.
   */
  status?: SubscriptionPaymentStatus
}

/** All SubscriptionPayment database access lives here — services never touch Prisma directly */
@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Status is left to the column default (PENDING) rather than passed in:
   * there is no caller that may choose it, and the default is where that rule
   * belongs — see SubscriptionPaymentStatus in schema.prisma.
   */
  create(towTruckId: number, data: SubscriptionPaymentCreateData): Promise<SubscriptionPayment> {
    return this.prisma.subscriptionPayment.create({ data: { towTruckId, ...data } })
  }

  /** The caller's own payments, newest first */
  findOwn(towTruckId: number): Promise<SubscriptionPayment[]> {
    return this.prisma.subscriptionPayment.findMany({
      where: { towTruckId },
      orderBy: { createdAt: 'desc' },
      take: OWN_PAYMENTS_LIMIT,
    })
  }

  /**
   * Per-driver coverage for `/admin/payments`, for every driver in one pass.
   *
   * Two grouped queries rather than one row per payment: this page lists every
   * driver on the platform, and pulling their whole payment history back just
   * to reduce it in JavaScript would grow with total payments ever made rather
   * than with the number of drivers shown.
   */
  async findCoverage(towTruckIds: number[]): Promise<Map<number, PaymentCoverageRow>> {
    if (towTruckIds.length === 0) return new Map()

    const [confirmed, pending] = await Promise.all([
      this.prisma.subscriptionPayment.groupBy({
        by: ['towTruckId'],
        where: { towTruckId: { in: towTruckIds }, status: SubscriptionPaymentStatus.PAID },
        _max: { periodEnd: true, periodStart: true },
      }),
      this.prisma.subscriptionPayment.groupBy({
        by: ['towTruckId'],
        where: { towTruckId: { in: towTruckIds }, status: SubscriptionPaymentStatus.PENDING },
        _count: { _all: true },
      }),
    ])

    const pendingByTruck = new Map(pending.map((row) => [row.towTruckId, row._count._all]))
    const coverage = new Map<number, PaymentCoverageRow>()

    for (const id of towTruckIds) {
      const paid = confirmed.find((row) => row.towTruckId === id)
      coverage.set(id, {
        towTruckId: id,
        // MAX(periodEnd), not "the newest row's periodEnd": a driver who
        // renews early has a later period than their most recent purchase
        // would suggest, and the question here is how far they are covered.
        paidUntil: paid?._max.periodEnd ?? null,
        lastPaidAt: paid?._max.periodStart ?? null,
        pendingCount: pendingByTruck.get(id) ?? 0,
      })
    }

    return coverage
  }

  /** The admin's queue — every request nobody has confirmed or cancelled yet, oldest first */
  /**
   * The admin's review list: payments that actually completed and have not
   * been ticked off yet.
   *
   * PAID only, and that is the change of meaning. This used to return PENDING
   * rows — requests waiting for a decision — from a time when an admin's
   * confirmation was what started a driver's coverage. The provider's callback
   * does that now, the driver is active the moment they pay, and a request
   * nobody finished paying is not something an admin should be looking at.
   */
  findForReview(): Promise<PendingPaymentWithDriver[]> {
    return this.prisma.subscriptionPayment.findMany({
      where: { status: SubscriptionPaymentStatus.PAID, reviewedAt: null },
      include: {
        towTruck: { select: { id: true, driverName: true, companyName: true, phone: true } },
      },
      // Oldest first: the payment that has been sitting unseen longest is the
      // one to look at next.
      orderBy: { createdAt: 'asc' },
      take: REVIEW_LIST_LIMIT,
    })
  }

  /**
   * Ticks a payment off the review list. Idempotent by the `reviewedAt: null`
   * guard, so two admins pressing at once produce one review, not an error.
   */
  async markReviewed(id: number): Promise<SubscriptionPayment | null> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id, status: SubscriptionPaymentStatus.PAID, reviewedAt: null },
      data: { reviewedAt: new Date() },
    })
    return count === 0 ? null : this.findById(id)
  }

  /**
   * Writes off payments nobody finished. Returns how many, for the log.
   *
   * CANCELLED rather than deleted: the row is the only trace that a driver
   * tried to pay and something stopped them, which is worth keeping when they
   * call to ask why.
   */
  async cancelAbandonedPending(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: {
        status: SubscriptionPaymentStatus.PENDING,
        createdAt: { lt: new Date(now.getTime() - ABANDONED_PENDING_TTL_MS) },
      },
      data: { status: SubscriptionPaymentStatus.CANCELLED },
    })
    return count
  }

  findById(id: number): Promise<SubscriptionPayment | null> {
    return this.prisma.subscriptionPayment.findUnique({ where: { id } })
  }

  /**
   * Moves a request out of PENDING.
   *
   * `where` carries the expected status, not just the id, so two admins acting
   * on the same request at the same time cannot both succeed — the second gets
   * no row back and the service turns that into a "this was already decided"
   * error rather than silently overwriting the first decision.
   */
  async setStatus(
    id: number,
    from: SubscriptionPaymentStatus,
    to: SubscriptionPaymentStatus,
  ): Promise<SubscriptionPayment | null> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id, status: from },
      data: { status: to },
    })
    return count === 0 ? null : this.findById(id)
  }

  /**
   * PENDING → PAID, writing the recomputed coverage window in the same
   * statement (see `renewalPeriod` for why it is recomputed at all).
   *
   * Guarded on the current status like `setStatus` above, so two admins
   * confirming the same request cannot both extend the driver's coverage.
   */
  /**
   * Confirms one payment, deriving its period inside the same transaction as
   * the coverage it extends.
   *
   * ## Why the whole read-compute-write is in here
   *
   * The period starts from the driver's existing coverage
   * (`renewalPeriod`), so confirming is a read of MAX(periodEnd), a
   * calculation, and a write. Done as three separate round trips, two
   * confirmations for the SAME DRIVER interleave at the `await` boundaries:
   * both read `paidUntil = X`, both compute `X + duration`, both write it, and
   * the driver has paid twice for one month — coverage is MAX(periodEnd), so
   * the second payment buys nothing. Two Idram callbacks, or a callback
   * meeting an admin's manual confirmation, are enough; a single Node process
   * is enough. Nothing about the per-row status guard below prevents it,
   * because the two writes are to different rows.
   *
   * `pg_advisory_xact_lock` on the tow-truck id serialises confirmations per
   * DRIVER — the actual unit of contention — and is released when the
   * transaction ends, however it ends. Different drivers never wait on each
   * other.
   *
   * `computePeriod` is passed in rather than inlined so the date arithmetic
   * stays in `subscription-period.ts`, where it is tested against clamping,
   * leap years and month rollovers, instead of being reimplemented in SQL.
   *
   * ## `not: PAID`, not `= PENDING`
   *
   * A payment that has already been PAID is done, and the caller handles that
   * separately. Anything else — including a row an admin CANCELLED while the
   * driver was on the provider's page — must still be confirmable: the money
   * moved, and refusing to record it would leave someone charged with nothing
   * to show for it. The guard still makes this idempotent: two confirmations
   * of the same row serialise on the row lock, and the loser re-evaluates the
   * predicate against a row that is now PAID and matches nothing.
   */
  async confirm(
    id: number,
    towTruckId: number,
    durationMonths: number,
    computePeriod: (paidUntil: Date | null, now: Date, months: number) => SubscriptionPeriod,
    source?: { provider: string; transactionId: string },
  ): Promise<SubscriptionPayment | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${towTruckId}::bigint)`

      const coverage = await tx.subscriptionPayment.aggregate({
        where: { towTruckId, status: SubscriptionPaymentStatus.PAID },
        _max: { periodEnd: true },
      })
      const period = computePeriod(coverage._max.periodEnd ?? null, new Date(), durationMonths)

      const { count } = await tx.subscriptionPayment.updateMany({
        where: { id, status: { not: SubscriptionPaymentStatus.PAID } },
        data: {
          status: SubscriptionPaymentStatus.PAID,
          periodStart: period.start,
          periodEnd: period.end,
          provider: source?.provider,
          providerTransactionId: source?.transactionId,
        },
      })
      if (count === 0) return null
      return tx.subscriptionPayment.findUnique({ where: { id } })
    })
  }

  /**
   * Records which provider transaction paid a bill that is ALREADY PAID.
   *
   * For the case where an admin confirmed a request by hand while the driver
   * was paying through the gateway: coverage is right, but the transaction id
   * is missing, so the payment cannot be reconciled against the provider's
   * statement — and nothing would stop the same transaction being credited
   * again later. Writing it also arms the replay check
   * (`findByProviderTransactionId`), which is what stops the provider retrying
   * a callback we have in fact accepted.
   *
   * Conditional on the column still being null, so it can never overwrite a
   * transaction id we already recorded.
   */
  async recordProviderTransaction(
    id: number,
    source: { provider: string; transactionId: string },
  ): Promise<boolean> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id, providerTransactionId: null },
      data: { provider: source.provider, providerTransactionId: source.transactionId },
    })
    return count > 0
  }

  /**
   * The payment a provider's transaction already produced, if any.
   *
   * Exists to answer "have I seen this callback before" — a gateway retries
   * anything it did not hear "OK" from, so the same transaction arriving twice
   * is normal traffic, not an attack. The unique index on the column is what
   * makes a race lose rather than double-confirm; this is the cheap check that
   * usually gets there first.
   */
  findByProviderTransactionId(transactionId: string): Promise<SubscriptionPayment | null> {
    return this.prisma.subscriptionPayment.findUnique({
      where: { providerTransactionId: transactionId },
    })
  }
}
