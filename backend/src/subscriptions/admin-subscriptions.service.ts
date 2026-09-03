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

    const coverage = await this.subscriptionsRepository.findCoverage([payment.towTruckId])
    const period = renewalPeriod(
      coverage.get(payment.towTruckId)?.paidUntil ?? null,
      new Date(),
      payment.durationMonths,
    )

    const confirmed = await this.subscriptionsRepository.confirm(id, period)
    if (!confirmed) throw new ConflictException('Այս հայտի վերաբերյալ որոշում արդեն կայացվել է')

    this.logger.warn(
      `Subscription payment #${id} confirmed by an admin for TowTruck #${payment.towTruckId}: ` +
        `${payment.planCode}, covered until ${period.end.toISOString()}`,
    )
    return toSubscriptionPaymentApi(confirmed)
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
  private parsePaidAt(paidAt?: string): Date {
    if (paidAt === undefined) return new Date()

    const date = new Date(paidAt)
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Սխալ ամսաթիվ')
    if (date.getTime() > Date.now()) {
      throw new BadRequestException('Վճարման ամսաթիվը չի կարող ապագայում լինել')
    }
    return date
  }
}
