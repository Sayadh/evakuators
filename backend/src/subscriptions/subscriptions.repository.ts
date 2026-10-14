import { Injectable } from '@nestjs/common'
import {
  PaymentKind,
  PromotionScope,
  SubscriptionPaymentStatus,
  type SubscriptionPayment,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { SubscriptionPeriod } from './subscription-period'
import { resolveCoveredUntil } from './subscription-status'

/**
 * Upper bound on a driver's own payment history response. Nothing caps how
 * many times a driver may press «Վճարել», so without this one driver decides
 * how large their own dashboard response is — same reasoning as
 * `PUBLIC_FREE_ROUTES_LIMIT`, and the newest-first order below already puts
 * the rows anyone cares about at the top.
 */
const OWN_PAYMENTS_LIMIT = 50

/**
 * A payment row that IS a subscription.
 *
 * Four columns on `SubscriptionPayment` are nullable because a placement
 * purchase leaves them empty, and on a subscription row they are never empty —
 * a database CHECK says so (see the migration). This type is where that
 * guarantee enters the type system, so the mapper does not have to assert it
 * value by value.
 *
 * It is only ever produced by a read that filters `kind: SUBSCRIPTION`. A cast
 * without that filter would be a lie the compiler cannot catch, which is why
 * the two always appear together below.
 */
export type SubscriptionPaymentRow = SubscriptionPayment & {
  planCode: string
  durationMonths: number
  periodStart: Date
  periodEnd: Date
}

/**
 * Is this row a subscription?
 *
 * Needed wherever a payment is fetched BY ID — `findById`, the Idram callback,
 * the admin's «Հաստատել» — because an id alone says nothing about what was
 * bought. Every such caller now has to decide what to do with a placement
 * instead of quietly treating it as a month of access, which is the whole
 * value of the compiler complaining here.
 */
export function isSubscriptionPayment(
  payment: SubscriptionPayment,
): payment is SubscriptionPaymentRow {
  return payment.kind === PaymentKind.SUBSCRIPTION
}

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

/**
 * What one driver is covered by right now — see DriverPaymentCoverage in
 * admin-payment.mapper.ts.
 *
 * `paidThrough` and `coveredUntil` are both here, and picking the wrong one is
 * the mistake this shape exists to make hard:
 *
 * - **`coveredUntil`** answers "may this driver work today" — status, the
 *   dashboard gate, `SubscriptionActiveGuard`. It counts an admin's deadline.
 * - **`paidThrough`** answers "what has this driver actually bought" — the
 *   only input a renewal may stack onto. Renewing from `coveredUntil` would
 *   turn a 5-day grace into 5 days of paid time the driver never paid for,
 *   every time.
 */
export interface PaymentCoverageRow {
  towTruckId: number
  /** Furthest `periodEnd` among PAID payments. Money, and nothing else. */
  paidThrough: Date | null
  /** The deadline an admin set — `TowTruck.paymentDueAt`. A promise, not money. */
  paymentDueAt: Date | null
  /** `resolveCoveredUntil(paidThrough, paymentDueAt)` — what every status decision reads. */
  coveredUntil: Date | null
  lastPaidAt: Date | null
  pendingCount: number
}

/** A pending request with just enough of its driver to render the admin's queue */
export type PendingPaymentWithDriver = SubscriptionPaymentRow & {
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
  create(towTruckId: number, data: SubscriptionPaymentCreateData): Promise<SubscriptionPaymentRow> {
    // `kind` written explicitly rather than left to the column default: the
    // default exists to backfill rows that predate placements, and a write that
    // says what it is cannot be misread when a second product is in the table.
    return this.prisma.subscriptionPayment.create({
      data: { towTruckId, kind: PaymentKind.SUBSCRIPTION, ...data },
    }) as Promise<SubscriptionPaymentRow>
  }

  /**
   * Records that a driver wants `days` of placement. PENDING — no money has
   * moved, and nothing is granted until the provider says so.
   *
   * In this file, and in this table, because the table is one ledger with two
   * products (see PaymentKind). A placements repository would be a second
   * place that knows how to write a payment row, and the bill number a driver
   * is handed is this table's primary key.
   *
   * `periodStart`/`periodEnd` are left null deliberately — see the migration:
   * it is what makes a placement unreadable as coverage even by a query that
   * forgot its `kind` filter.
   */
  createPromotion(
    towTruckId: number,
    data: { days: number; scope: PromotionScope; amount: number; currency: string },
  ): Promise<SubscriptionPayment> {
    return this.prisma.subscriptionPayment.create({
      data: {
        towTruckId,
        kind: PaymentKind.PROMOTION,
        promotionDays: data.days,
        promotionScope: data.scope,
        amount: data.amount,
        currency: data.currency,
      },
    })
  }

  /**
   * Marks a placement payment PAID and extends the driver's placement, in one
   * transaction.
   *
   * The two halves cannot be separated. A payment marked PAID whose days never
   * landed is a driver charged for nothing; days granted against a payment that
   * stayed PENDING is a placement nobody paid for, which the abandoned-payment
   * sweep would then cancel underneath. Both tables, one transaction.
   *
   * `status: { not: PAID }` is the idempotency: a gateway retries a callback it
   * did not hear OK from, and the second attempt must find nothing to do rather
   * than add the days again. Returns null when it did — the caller treats that
   * as "already done".
   *
   * Touching `TowTruck` from this file follows the same precedent as
   * `findCoverage` reading `paymentDueAt`: the alternative is two transactions
   * and the window between them.
   */
  async confirmPromotion(
    id: number,
    towTruckId: number,
    grant: { days: number; scope: PromotionScope },
    now: Date,
    source?: { provider: string; transactionId: string },
  ): Promise<SubscriptionPayment | null> {
    const { days, scope } = grant
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.subscriptionPayment.updateMany({
        where: { id, kind: PaymentKind.PROMOTION, status: { not: SubscriptionPaymentStatus.PAID } },
        data: {
          status: SubscriptionPaymentStatus.PAID,
          provider: source?.provider,
          providerTransactionId: source?.transactionId,
        },
      })
      if (count === 0) return null

      // Raw SQL rather than a TowTrucksRepository call because it has to run
      // inside THIS transaction. `featuredAt = now` either way: a purchase is a
      // refresh, and it is the one queue key both products share.
      if (scope === PromotionScope.AREA) {
        await tx.$executeRaw`
          UPDATE "TowTruck"
          SET "featuredAt" = ${now},
              "areaFeaturedUntil" = GREATEST(COALESCE("areaFeaturedUntil", ${now}), ${now})
                                    + (${days}::int * INTERVAL '1 day')
          WHERE "id" = ${towTruckId}::int
        `
      } else {
        // HOME days start where a live AREA window ends, not alongside it: the
        // area product already holds the home top, so running both at once
        // would sell the same position twice. Matches `PromotionsService.maxDays`.
        await tx.$executeRaw`
          UPDATE "TowTruck"
          SET "isFeatured" = true,
              "featuredAt" = ${now},
              "featuredUntil" = GREATEST(
                                  COALESCE("featuredUntil", ${now}),
                                  COALESCE("areaFeaturedUntil", ${now}),
                                  ${now}
                                ) + (${days}::int * INTERVAL '1 day')
          WHERE "id" = ${towTruckId}::int
        `
      }

      return tx.subscriptionPayment.findUnique({ where: { id } })
    })
  }

  /**
   * The caller's own SUBSCRIPTION payments, newest first.
   *
   * Placements are deliberately not in this list: it renders as "until when am
   * I covered", and a 400 ֏ one-day placement among the months would read as a
   * very short subscription. The driver's placement history belongs to the
   * promotion block, which knows what to call it.
   */
  findOwn(towTruckId: number): Promise<SubscriptionPaymentRow[]> {
    return this.prisma.subscriptionPayment.findMany({
      where: { towTruckId, kind: PaymentKind.SUBSCRIPTION },
      orderBy: { createdAt: 'desc' },
      take: OWN_PAYMENTS_LIMIT,
    }) as Promise<SubscriptionPaymentRow[]>
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

    const [confirmed, pending, due] = await Promise.all([
      // `kind` is not decoration on these two. This table also holds placement
      // purchases, and a placement grants no access — without the filter a
      // driver who bought one day at the top of their town page would read as
      // covered. See PaymentKind in schema.prisma.
      this.prisma.subscriptionPayment.groupBy({
        by: ['towTruckId'],
        where: {
          towTruckId: { in: towTruckIds },
          kind: PaymentKind.SUBSCRIPTION,
          status: SubscriptionPaymentStatus.PAID,
        },
        _max: { periodEnd: true, periodStart: true },
      }),
      this.prisma.subscriptionPayment.groupBy({
        by: ['towTruckId'],
        where: {
          towTruckId: { in: towTruckIds },
          kind: PaymentKind.SUBSCRIPTION,
          status: SubscriptionPaymentStatus.PENDING,
        },
        _count: { _all: true },
      }),
      // The admin-set deadlines, read here rather than left to each caller:
      // every one of them needs coverage, none of them should have to know it
      // now comes from two tables.
      this.prisma.towTruck.findMany({
        where: { id: { in: towTruckIds } },
        select: { id: true, paymentDueAt: true },
      }),
    ])

    const pendingByTruck = new Map(pending.map((row) => [row.towTruckId, row._count._all]))
    const dueByTruck = new Map(due.map((row) => [row.id, row.paymentDueAt]))
    const coverage = new Map<number, PaymentCoverageRow>()

    for (const id of towTruckIds) {
      const paid = confirmed.find((row) => row.towTruckId === id)
      // MAX(periodEnd), not "the newest row's periodEnd": a driver who renews
      // early has a later period than their most recent purchase would
      // suggest, and the question here is how far they are covered.
      const paidThrough = paid?._max.periodEnd ?? null
      const paymentDueAt = dueByTruck.get(id) ?? null

      coverage.set(id, {
        towTruckId: id,
        paidThrough,
        paymentDueAt,
        coveredUntil: resolveCoveredUntil(paidThrough, paymentDueAt),
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
      // Subscription payments only. This queue asks "money arrived, is this
      // driver's access sorted" — a placement grants no access, so a promotion
      // row has nothing for an admin to do here. (A general money view that
      // shows both is worth having; it is not this screen.)
      where: {
        kind: PaymentKind.SUBSCRIPTION,
        status: SubscriptionPaymentStatus.PAID,
        reviewedAt: null,
      },
      include: {
        towTruck: { select: { id: true, driverName: true, companyName: true, phone: true } },
      },
      // Oldest first: the payment that has been sitting unseen longest is the
      // one to look at next.
      orderBy: { createdAt: 'asc' },
      take: REVIEW_LIST_LIMIT,
    }) as Promise<PendingPaymentWithDriver[]>
  }

  /**
   * Ticks a payment off the review list. Idempotent by the `reviewedAt: null`
   * guard, so two admins pressing at once produce one review, not an error.
   */
  async markReviewed(id: number): Promise<SubscriptionPaymentRow | null> {
    const { count } = await this.prisma.subscriptionPayment.updateMany({
      where: { id, status: SubscriptionPaymentStatus.PAID, reviewedAt: null },
      data: { reviewedAt: new Date() },
    })
    // The caller proved the kind before it got here (see
    // `AdminSubscriptionsService.review`), which is what this cast stands on.
    return count === 0 ? null : (this.findById(id) as Promise<SubscriptionPaymentRow | null>)
  }

  /**
   * Writes off payments nobody finished. Returns how many, for the log.
   *
   * CANCELLED rather than deleted: the row is the only trace that a driver
   * tried to pay and something stopped them, which is worth keeping when they
   * call to ask why.
   */
  async cancelAbandonedPending(now: Date = new Date()): Promise<number> {
    // No `kind` filter, and that is deliberate: an abandoned PENDING row is
    // abandoned whatever it was going to buy. This is the one sweep that
    // should see both.
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
  ): Promise<SubscriptionPaymentRow | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${towTruckId}::bigint)`

      // Subscriptions only — a placement is not coverage, and this MAX is what
      // the next period is measured from.
      const coverage = await tx.subscriptionPayment.aggregate({
        where: {
          towTruckId,
          kind: PaymentKind.SUBSCRIPTION,
          status: SubscriptionPaymentStatus.PAID,
        },
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
      // Subscription by construction: this method only ever runs for a row the
      // caller has already proven is one, and it has just written the four
      // columns the narrowed type promises.
      return tx.subscriptionPayment.findUnique({
        where: { id },
      }) as Promise<SubscriptionPaymentRow | null>
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
