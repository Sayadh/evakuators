import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { UNKNOWN_PLAN_MESSAGE } from './dto/create-subscription-payment.dto'
import { subscriptionPeriod } from './subscription-period'
import { findSubscriptionPlan, SUBSCRIPTION_PLANS } from './subscription-plans'
import { toSubscriptionPaymentApi, toSubscriptionPlanApi } from './subscription.mapper'
import { derivePaymentStatus, isLockedOut } from './subscription-status'
import type {
  MySubscriptionStatusApi,
  SubscriptionPaymentApi,
  SubscriptionPlansApi,
} from './subscription.types'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { SubscriptionsRepository } from './subscriptions.repository'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whole days from now until `until`, floored and never negative — what the
 * dashboard's warning counts down ("5 days left"). Null coverage and a date
 * already past both read as 0, which is what a driver with nothing left has.
 */
function daysUntil(until: Date | null): number {
  if (until === null) return 0
  return Math.max(0, Math.floor((until.getTime() - Date.now()) / DAY_MS))
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name)

  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    // Only for the deactivation half of getMyStatus — this service never
    // writes a truck.
    private readonly towTrucksRepository: TowTrucksRepository,
  ) {}

  /** Synchronous on purpose — the plans are constants, there is nothing to await (see subscription-plans.ts) */
  listPlans(): SubscriptionPlansApi {
    return { items: SUBSCRIPTION_PLANS.map(toSubscriptionPlanApi) }
  }

  listMyPayments(towTruckId: number): Promise<SubscriptionPaymentApi[]> {
    return this.subscriptionsRepository
      .findOwn(towTruckId)
      .then((payments) => payments.map(toSubscriptionPaymentApi))
  }

  /**
   * Where this driver stands, for the dashboard's gate.
   *
   * Computed here rather than sent as raw payments for the frontend to reduce:
   * the rule that decides "locked" is the same one `SubscriptionActiveGuard`
   * enforces at the API, and a second copy of it in the browser is how the two
   * end up disagreeing about whether someone may edit their profile.
   */
  async getMyStatus(towTruckId: number): Promise<MySubscriptionStatusApi> {
    const [coverage, towTruck] = await Promise.all([
      this.subscriptionsRepository.findCoverage([towTruckId]),
      this.towTrucksRepository.findStatusById(towTruckId),
    ])
    const paidUntil = coverage.get(towTruckId)?.paidUntil ?? null
    const status = derivePaymentStatus(paidUntil)

    return {
      status,
      paidUntil: paidUntil?.toISOString(),
      daysLeft: daysUntil(paidUntil),
      // A deactivated driver is locked whatever their period says: being off
      // the site is a stronger statement than a date, and the dashboard has
      // the same one thing to offer either way.
      locked: isLockedOut(status) || towTruck?.isActive === false,
      isActive: towTruck?.isActive ?? false,
      deactivationReason: towTruck?.deactivationReason ?? undefined,
    }
  }

  /**
   * Records that this driver wants this plan. **No money moves here** — there
   * is no payment provider wired up yet, so the row is PENDING and grants
   * nothing (see SubscriptionPaymentStatus in schema.prisma).
   *
   * `towTruckId` comes from the JWT, never from the body — the caller cannot
   * even express a request to pay on someone else's behalf. Price and duration
   * come from `subscription-plans.ts` and are COPIED onto the row, so a later
   * price change cannot rewrite what this driver was quoted.
   *
   * Nothing here deduplicates a double-press into one row. Two identical
   * PENDING rows cost nothing and grant nothing, and real idempotency needs a
   * key that only the payment provider can supply (its transaction id) — so
   * it belongs with that step, not as a guess made now. The dashboard button
   * is disabled while the request is in flight, which is what actually stops
   * the common case.
   */
  async createPayment(towTruckId: number, planId: string): Promise<SubscriptionPaymentApi> {
    const plan = findSubscriptionPlan(planId)
    // Defense in depth: CreateSubscriptionPaymentDto's @IsIn has already
    // rejected anything else. This exists so the service is still safe when
    // called from somewhere that isn't that controller.
    if (!plan) throw new BadRequestException(UNKNOWN_PLAN_MESSAGE)

    const period = subscriptionPeriod(new Date(), plan.durationMonths)
    const payment = await this.subscriptionsRepository.create(towTruckId, {
      planCode: plan.code,
      amount: plan.price,
      currency: plan.currency,
      durationMonths: plan.durationMonths,
      periodStart: period.start,
      periodEnd: period.end,
    })

    this.logger.log(
      `Subscription payment #${payment.id} requested by TowTruck #${towTruckId}: ${plan.code}, ${plan.price} ${plan.currency} (PENDING)`,
    )
    return toSubscriptionPaymentApi(payment)
  }
}
