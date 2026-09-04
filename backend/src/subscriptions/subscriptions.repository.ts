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
  findPending(): Promise<PendingPaymentWithDriver[]> {
    return this.prisma.subscriptionPayment.findMany({
      where: { status: SubscriptionPaymentStatus.PENDING },
      include: {
        towTruck: { select: { id: true, driverName: true, companyName: true, phone: true } },
      },
      // Oldest first: a request that has been waiting longest is the one an
      // admin should decide on next.
      orderBy: { createdAt: 'asc' },
    })
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
  async confirm(
    id: number,
    period: SubscriptionPeriod,
    source?: { provider: string; transactionId: string },
  ): Promise<SubscriptionPayment | null> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id, status: SubscriptionPaymentStatus.PENDING },
      data: {
        status: SubscriptionPaymentStatus.PAID,
        periodStart: period.start,
        periodEnd: period.end,
        provider: source?.provider,
        providerTransactionId: source?.transactionId,
      },
    })
    return count === 0 ? null : this.findById(id)
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
