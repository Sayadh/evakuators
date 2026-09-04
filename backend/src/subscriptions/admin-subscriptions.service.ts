import { armeniaDateKey } from '../common/armenia-day'
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { SubscriptionPaymentStatus } from '@prisma/client'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import type { DecidableStatus } from './dto/decide-subscription-payment.dto'
import { UNKNOWN_PLAN_MESSAGE } from './dto/create-subscription-payment.dto'
import { renewalPeriod } from './subscription-period'
import { findSubscriptionPlan } from './subscription-plans'
import { toAdminPendingPaymentApi, toSubscriptionPaymentApi } from './subscription.mapper'
import type { AdminPendingPaymentApi, SubscriptionPaymentApi } from './subscription.types'
import { SubscriptionsRepository } from './subscriptions.repository'
import { SubscriptionsService } from './subscriptions.service'

/**
 * The admin half of subscriptions: deciding requests drivers made, and
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
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async listPending(): Promise<AdminPendingPaymentApi[]> {
    const pending = await this.subscriptionsRepository.findPending()
    return pending.map(toAdminPendingPaymentApi)
  }

  /**
   * Confirms or cancels one request a driver made.
   *
   * On confirmation the period is RECOMPUTED rather than taken from the row —
   * see `renewalPeriod` for why the stored one was only ever a quote, and why
   * confirming extends existing coverage instead of restarting it.
   */
  async decide(id: number, status: DecidableStatus): Promise<SubscriptionPaymentApi> {
    const payment = await this.subscriptionsRepository.findById(id)
    if (!payment) throw new NotFoundException(`Վճարման հայտ #${id}-ը չի գտնվել`)
    if (payment.status !== SubscriptionPaymentStatus.PENDING) {
      throw new ConflictException('Այս հայտի վերաբերյալ որոշում արդեն կայացվել է')
    }

    if (status === SubscriptionPaymentStatus.CANCELLED) {
      const cancelled = await this.subscriptionsRepository.setStatus(
        id,
        SubscriptionPaymentStatus.PENDING,
        SubscriptionPaymentStatus.CANCELLED,
      )
      if (!cancelled) throw new ConflictException('Այս հայտի վերաբերյալ որոշում արդեն կայացվել է')
      this.logger.warn(`Subscription payment #${id} cancelled by an admin`)
      return toSubscriptionPaymentApi(cancelled)
    }

    // Delegated, not reimplemented: the period recomputation, the extension of
    // live coverage and the race-safe status guard all live in one place, so
    // an admin confirming and Idram confirming cannot drift apart. See
    // SubscriptionsService.confirmPayment.
    const confirmed = await this.subscriptions.confirmPayment(id)
    if (!confirmed) throw new ConflictException('Այս հայտի վերաբերյալ որոշում արդեն կայացվել է')

    this.logger.warn(`Subscription payment #${id} confirmed by an admin`)
    return confirmed
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
    const period = renewalPeriod(coverage.get(towTruckId)?.paidUntil ?? null, from, plan.durationMonths)

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
