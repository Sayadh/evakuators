import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common'
import { UNKNOWN_PLAN_MESSAGE } from './dto/create-subscription-payment.dto'
import { renewalPeriod, subscriptionPeriod } from './subscription-period'
import { findSubscriptionPlan, SUBSCRIPTION_PLANS } from './subscription-plans'
import { toSubscriptionPaymentApi, toSubscriptionPlanApi } from './subscription.mapper'
import { derivePaymentStatus, isLockedOut } from './subscription-status'
import type {
  CreatedSubscriptionPaymentApi,
  MySubscriptionStatusApi,
  SubscriptionPaymentApi,
  SubscriptionPlansApi,
} from './subscription.types'
import { IdramService } from '../idram/idram.service'
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
    // forwardRef: a real cycle, declared rather than broken. Creating a
    // payment needs the provider's handoff form, and the provider's callback
    // needs confirmPayment() here — the alternative is a second round trip
    // from the browser, or a copy of the confirmation rules on the Idram side.
    @Inject(forwardRef(() => IdramService))
    private readonly idram: IdramService,
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
    const paymentsEnabled = this.idram.isConfigured

    return {
      status,
      paidUntil: paidUntil?.toISOString(),
      daysLeft: daysUntil(paidUntil),
      // Two independent reasons to lock, and only one of them is about money.
      //
      // The expiry half is gated on `paymentsEnabled` for the same reason
      // SubscriptionActiveGuard is: with no gateway there is no way to pay, so
      // a lock would be a dead end — and the backfill makes every driver who
      // predates this feature read as `overdue` on the deploy that ships it.
      //
      // Deactivation is NOT gated. A deactivated driver is off the site
      // whatever their period says, that is an admin's decision rather than a
      // billing state, and the dashboard has the same one thing to offer them
      // either way.
      locked: (paymentsEnabled && isLockedOut(status)) || towTruck?.isActive === false,
      paymentsEnabled,
      isActive: towTruck?.isActive ?? false,
      deactivationReason: towTruck?.deactivationReason ?? undefined,
    }
  }

  /**
   * The ONE place a payment becomes PAID.
   *
   * Three callers today and more later — an admin confirming a request, an
   * admin recording money that arrived offline, and Idram's own callback —
   * and they must not each grow their own version of this. What is easy to
   * get subtly different, and expensive when it is:
   *
   * - the period is RECOMPUTED here, never taken from the row (that value was
   *   a quote — see `renewalPeriod`);
   * - it EXTENDS live coverage instead of restarting it, so a driver who pays
   *   early is not punished for it;
   * - the PENDING → PAID move is guarded on the current status inside a single
   *   statement, so two confirmations racing produce one paid month, not two.
   *
   * Returns null when the row was already decided — which the caller must
   * treat as information, not an error: for a gateway retry it means "already
   * done, say OK", and for an admin it means "someone got here first".
   */
  async confirmPayment(
    paymentId: number,
    source?: { provider: string; transactionId: string },
  ): Promise<SubscriptionPaymentApi | null> {
    const payment = await this.subscriptionsRepository.findById(paymentId)
    if (!payment) return null

    const coverage = await this.subscriptionsRepository.findCoverage([payment.towTruckId])
    const period = renewalPeriod(
      coverage.get(payment.towTruckId)?.paidUntil ?? null,
      new Date(),
      payment.durationMonths,
    )

    const confirmed = await this.subscriptionsRepository.confirm(paymentId, period, source)
    if (!confirmed) return null

    this.logger.warn(
      `Subscription payment #${paymentId} confirmed for TowTruck #${payment.towTruckId}: ` +
        `${payment.planCode}, ${payment.amount} ${payment.currency}, covered until ` +
        `${period.end.toISOString()}${source ? ` (${source.provider} ${source.transactionId})` : ''}`,
    )
    return toSubscriptionPaymentApi(confirmed)
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
  async createPayment(towTruckId: number, planId: string): Promise<CreatedSubscriptionPaymentApi> {
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
    return {
      ...toSubscriptionPaymentApi(payment),
      // The row exists BEFORE the driver is handed over, and that ordering is
      // required rather than convenient: the provider's first callback asks
      // whether this bill is a real order, and there would be nothing to
      // answer with otherwise.
      gateway: this.idram.paymentForm(payment.id, plan.price, plan.title),
    }
  }
}
