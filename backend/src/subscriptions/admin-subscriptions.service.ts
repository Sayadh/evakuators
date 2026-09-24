import { armeniaDateKey, armeniaDateLabel } from '../common/armenia-day'
import { Cron, CronExpression } from '@nestjs/schedule'
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { SubscriptionPaymentStatus } from '@prisma/client'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { UNKNOWN_PLAN_MESSAGE } from './dto/create-subscription-payment.dto'
import { renewalPeriod } from './subscription-period'
import { findSubscriptionPlan } from './subscription-plans'
import { PAYMENT_DUE_SOON_WITHIN_DAYS } from './subscription-status'
import { toAdminPendingPaymentApi, toSubscriptionPaymentApi } from './subscription.mapper'
import type { AdminPendingPaymentApi, SubscriptionPaymentApi } from './subscription.types'
import { ListingRestorationService } from './listing-restoration.service'
import { SubscriptionsRepository } from './subscriptions.repository'

/**
 * The admin half of subscriptions: reviewing payments that completed, and
 * recording payments that arrived outside the platform.
 *
 * Separate from `SubscriptionsService` (the driver's own) on purpose — the two
 * answer to different guards and different rules, and the one thing that must
 * NOT be shared is the ability to write a PAID row: a driver's own flow can
 * only ever create PENDING.
 */
@Injectable()
export class AdminSubscriptionsService {
  private readonly logger = new Logger(AdminSubscriptionsService.name)

  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly listingRestoration: ListingRestorationService,
  ) {}

  /**
   * Payments that went through and have not been ticked off yet.
   *
   * ## Why this is not a decision queue any more
   *
   * It used to list PENDING requests, from a time when an admin's confirmation
   * was what started a driver's coverage. That is no longer how a payment
   * completes: Idram's callback confirms it and the driver is active the same
   * second. Making them wait for an admin afterwards would be charging someone
   * and then holding what they bought.
   *
   * So this is a REVIEW list — money that arrived, shown once so a person sees
   * it — and «Հաստատել» only means "I have seen this". Requests nobody
   * finished paying never appear: they are written off by `cancelAbandoned`
   * below.
   */
  async listForReview(): Promise<AdminPendingPaymentApi[]> {
    const payments = await this.subscriptionsRepository.findForReview()
    return payments.map(toAdminPendingPaymentApi)
  }

  /**
   * Ticks one payment off the review list.
   *
   * Acknowledgement, nothing else: it grants no coverage, revokes none, and
   * cannot fail in a way that costs anyone money. Reviewing twice is not an
   * error — two admins working the same list at once is ordinary, and the
   * second one should see the row gone, not a conflict.
   */
  async review(id: number): Promise<SubscriptionPaymentApi> {
    const payment = await this.subscriptionsRepository.findById(id)
    if (!payment) throw new NotFoundException(`Վճարումը #${id} չի գտնվել`)
    if (payment.status !== SubscriptionPaymentStatus.PAID) {
      throw new ConflictException('Միայն կատարված վճարումը կարելի է հաստատել')
    }

    const reviewed = await this.subscriptionsRepository.markReviewed(id)
    if (!reviewed) return toSubscriptionPaymentApi(payment)

    this.logger.log(`Subscription payment #${id} reviewed by an admin`)
    return toSubscriptionPaymentApi(reviewed)
  }

  /**
   * Writes off payments nobody finished, once a day.
   *
   * A PENDING row is created the moment a driver presses «Վճարել», before they
   * ever reach the provider — so most of them are people who changed their
   * mind, and until now nothing cleaned them up. They are invisible to the
   * admin either way; this stops them accumulating in the table forever.
   *
   * 4AM for the same reason the other daily jobs here run then: nobody is
   * using the site, and a slow sweep costs nothing.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cancelAbandoned(): Promise<void> {
    const cancelled = await this.subscriptionsRepository.cancelAbandonedPending()
    if (cancelled > 0) {
      this.logger.log(`Abandoned payment sweep: cancelled ${cancelled} unfinished request(s)`)
    }
  }

  /**
   * Starts billing a driver who has never paid, or stops.
   *
   * ## The thing this is NOT
   *
   * It is not «Գրանցել վճարում» with the date moved. That records a PAID row,
   * and a PAID row is a claim that money arrived. This driver has paid
   * nothing; the only true statement available is "they owe by this date", and
   * that is what gets written — to `TowTruck.paymentDueAt`, outside the money
   * ledger entirely. `SUM(amount) WHERE status = 'PAID'` stays real revenue no
   * matter how many deadlines get handed out.
   *
   * ## Why the date is not a parameter
   *
   * `PAYMENT_DUE_SOON_WITHIN_DAYS` ahead, always. That constant is the width
   * of the `due-soon` window, so a deadline exactly that far out drops the
   * driver into `due-soon` the instant this returns and holds them there until
   * it passes: «Վճարման ժամկետը մոտենում է» every day, then «սպառվել է» and
   * the lock. One constant, so the warning and the grace cannot drift apart.
   *
   * ## Only for a driver who has never paid
   *
   * Not "not covered right now" — ever. A driver with any confirmed payment is
   * already inside the billing cycle: their own `periodEnd` drives their
   * status, and when it lapses they go `overdue` and are locked without anyone
   * pressing anything. A deadline for them would be stored and then ignored
   * (coverage is a MAX), which is a button reporting success and changing
   * nothing. The admin panel hides it for them; this is the same rule at the
   * API, because a hidden button is a suggestion and a guard is not.
   *
   * The narrower "not covered today" rule would have let an admin restart a
   * driver who paid in March and lapsed in April. The answer there is to chase
   * the renewal, not to hand them another five free days.
   *
   * Turning it OFF is always allowed, whatever their history: that is how a
   * deadline set by mistake gets taken back.
   */
  async setPaymentDue(
    towTruckId: number,
    due: boolean,
  ): Promise<{ id: number; paymentDueAt?: string }> {
    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${towTruckId}-ը չի գտնվել`)

    if (!due) {
      const cleared = await this.towTrucksRepository.setPaymentDueAt(towTruckId, null)
      this.logger.warn(`Payment deadline cleared for TowTruck #${towTruckId} by an admin`)
      return { id: cleared.id, paymentDueAt: undefined }
    }

    const coverage = await this.subscriptionsRepository.findCoverage([towTruckId])
    const paidThrough = coverage.get(towTruckId)?.paidThrough ?? null
    if (paidThrough !== null) {
      throw new ConflictException(
        `Այս վարորդն արդեն վճարել է (ծածկույթը՝ մինչև ${armeniaDateLabel(paidThrough)}) — ` +
          'նա արդեն սովորական վճարային ցիկլում է։',
      )
    }

    const paymentDueAt = new Date(
      Date.now() + PAYMENT_DUE_SOON_WITHIN_DAYS * 24 * 60 * 60 * 1000,
    )
    const updated = await this.towTrucksRepository.setPaymentDueAt(towTruckId, paymentDueAt)

    this.logger.warn(
      `Payment deadline set for TowTruck #${towTruckId} by an admin: ` +
        `due ${paymentDueAt.toISOString()} (${PAYMENT_DUE_SOON_WITHIN_DAYS} days)`,
    )
    return { id: updated.id, paymentDueAt: updated.paymentDueAt?.toISOString() }
  }

  /**
   * Records a payment that arrived outside the platform, as a PAID row.
   *
   * This is the replacement for the old «նշել վճարված» button, and the reason
   * it takes a plan rather than a date alone: the status now depends on how
   * long the driver is covered, so "they paid" is not an answer — "they paid
   * for one month" is.
   */
  async grant(towTruckId: number, planId: string, paidAt?: string): Promise<SubscriptionPaymentApi> {
    const plan = findSubscriptionPlan(planId)
    if (!plan) throw new BadRequestException(UNKNOWN_PLAN_MESSAGE)

    const towTruck = await this.towTrucksRepository.findById(towTruckId)
    if (!towTruck) throw new NotFoundException(`Էվակուատոր #${towTruckId}-ը չի գտնվել`)

    const from = this.parsePaidAt(paidAt)
    const coverage = await this.subscriptionsRepository.findCoverage([towTruckId])
    // `paidThrough`, never `coveredUntil`: stacking onto an admin's deadline
    // would hand the driver the grace days a second time, as paid time they
    // did not pay for.
    const period = renewalPeriod(
      coverage.get(towTruckId)?.paidThrough ?? null,
      from,
      plan.durationMonths,
    )

    const payment = await this.subscriptionsRepository.create(towTruckId, {
      planCode: plan.code,
      amount: plan.price,
      currency: plan.currency,
      durationMonths: plan.durationMonths,
      periodStart: period.start,
      periodEnd: period.end,
      status: SubscriptionPaymentStatus.PAID,
    })

    this.logger.warn(
      `Subscription payment #${payment.id} recorded by an admin for TowTruck #${towTruckId}: ` +
        `${plan.code}, covered until ${period.end.toISOString()}`,
    )

    // The same thing the Idram path does after crediting. Money arriving in
    // cash and money arriving through the gateway leave the identical row
    // behind, so they have to leave the driver in the identical state: without
    // this, a driver deactivated for non-payment paid, was recorded as `paid`,
    // and stayed off the site — looking at a lockout screen with no way to tell
    // whether their money had arrived, until somebody remembered a second,
    // unrelated admin action.
    await this.listingRestoration.afterPayment(towTruckId)

    return toSubscriptionPaymentApi(payment)
  }

  /**
   * Validated again here rather than trusted from `@IsISO8601` — that only
   * proves the string is a date, not that it makes sense as a payment date.
   * A future date would let a driver read as covered before they paid. Same
   * check, same reasoning, as the old `AdminService.setTowTruckPayment`.
   */
  /**
   * When the coverage this grant buys should START.
   *
   * ## Today or later, never in the past
   *
   * A back-dated start silently sells less than the plan says: a month bought
   * from three weeks ago is one week of coverage, and far enough back it
   * creates a subscription that is already expired — recorded as PAID, with
   * the driver reading as `overdue` the moment it is saved. Whatever the money
   * did last week, the access it buys begins when it is granted.
   *
   * Forward-dating is allowed, and is a real case: a driver pays now for a
   * period that starts later. `renewalPeriod` already handles the interaction
   * with live coverage — if their current period runs past the chosen date,
   * the new one is stacked on the end of it and the date is moot.
   *
   * Compared by Armenia's calendar DAY, not by instant, because that is what
   * the admin picked. `new Date('2026-09-08')` is midnight UTC — 04:00 in
   * Yerevan — so an instant comparison would reject today's own date for the
   * first four hours of every Armenian day.
   */
  private parsePaidAt(paidAt?: string): Date {
    if (paidAt === undefined) return new Date()

    const date = new Date(paidAt)
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Սխալ ամսաթիվ')
    if (armeniaDateKey(date) < armeniaDateKey(new Date())) {
      throw new BadRequestException('Վճարման ամսաթիվը չի կարող անցյալում լինել')
    }
    return date
  }
}
