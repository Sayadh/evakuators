import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import { PaymentKind, PromotionScope } from '@prisma/client'
import { armeniaDateKey } from '../common/armenia-day'
import { IdramService } from '../idram/idram.service'
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository'
import { FEATURED_MAX_DAYS, isAreaFeaturedNow, isFeaturedNow } from '../tow-trucks/featured'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import { isSpecialistVehicleType } from '../tow-trucks/vehicle-types'
import {
  AREA_PROMOTION_PRICE_BRACKETS,
  PROMOTION_BUMPS_PER_DAY,
  PROMOTION_CURRENCY,
  PROMOTION_PRICE_BRACKETS,
  promotionPrice,
} from './promotion-pricing'
import { promotionPaymentTitle } from './promotion-labels'
import type {
  CreatedPromotionPaymentApi,
  PromotionPaymentApi,
  PromotionStatusApi,
} from './promotion.types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A driver buying their own place at the top of their town's page.
 *
 * ## The three rules this screen exists to enforce
 *
 * 1. **A deactivated listing has no block at all.** Not disabled — absent. The
 *    driver is off the site; offering to sell them a position on it would be
 *    taking money for something nobody can see.
 * 2. **No live subscription, no sale.** The block is shown and says why, because
 *    the fix is one screen away and hiding it would leave a driver wondering
 *    where the feature went.
 * 3. **A placement may not outlive the subscription it decorates.** `maxDays` is
 *    the distance from where the placement would start to the day the
 *    subscription runs out — so a driver cannot buy thirty days on top of a
 *    week of access and lose three weeks of it when their listing goes dark.
 *
 * All three are decided here, on every read AND on every write. The status call
 * exists so the page can render the right thing; it is not what makes the rules
 * true.
 */
@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name)

  constructor(
    private readonly towTrucksRepository: TowTrucksRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    @Inject(forwardRef(() => IdramService))
    private readonly idram: IdramService,
  ) {}

  async getStatus(towTruckId: number, now: Date = new Date()): Promise<PromotionStatusApi> {
    const truck = await this.towTrucksRepository.findById(towTruckId)
    if (!truck) throw new NotFoundException(`Էվակուատոր #${towTruckId}-ը չի գտնվել`)

    const base = {
      refreshesPerDay: PROMOTION_BUMPS_PER_DAY,
      brackets: PROMOTION_PRICE_BRACKETS,
      currency: PROMOTION_CURRENCY,
    }

    const closed = (blockedReason: 'inactive' | 'not-listed'): PromotionStatusApi => ({
      ...base,
      visible: blockedReason !== 'inactive',
      blockedReason,
      homeAvailable: false,
      refreshesLeft: 0,
      maxDays: 0,
      area: { maxDays: 0, brackets: AREA_PROMOTION_PRICE_BRACKETS },
    })

    if (!truck.isActive) return closed('inactive')
    // Same predicate the listings use to keep these off city pages, so the two
    // cannot disagree about who a placement can do anything for.
    if (isSpecialistVehicleType(truck.vehicleType)) return closed('not-listed')
    const homeAvailable = truck.citySlug !== null || truck.districtSlug !== null

    const live = isFeaturedNow(truck, now)
    const areaLive = isAreaFeaturedNow(truck, now)
    const anyLive = live || areaLive
    const coverage = await this.subscriptionsRepository.findCoverage([towTruckId])
    // `paidThrough`, not `coveredUntil`: coverage also counts the deadline an
    // admin gives a driver who has NOT paid, and "you have until Friday to pay"
    // is not a subscription to hang a placement on.
    const paidThrough = coverage.get(towTruckId)?.paidThrough ?? null
    const subscribed = paidThrough !== null && paidThrough.getTime() > now.getTime()

    // Both products are measured from the latest live end of EITHER window.
    // They never run on the same days (see `confirmPromotion`): HOME bought
    // now starts after a live AREA window, and AREA bought now pushes the
    // remaining HOME days behind itself — so whichever is bought, everything
    // already running ends later by exactly the days bought, and that end must
    // still fit inside the subscription.
    const onSale = subscribed
      ? this.maxDays(
          [live ? truck.featuredUntil : null, areaLive ? truck.areaFeaturedUntil : null],
          paidThrough,
          now,
        )
      : 0

    const status: PromotionStatusApi = {
      ...base,
      visible: true,
      homeAvailable,
      refreshesLeft: anyLive ? this.refreshesLeft(truck, now) : 0,
      maxDays: homeAvailable ? onSale : 0,
      ...(live && truck.featuredUntil ? { activeUntil: truck.featuredUntil.toISOString() } : {}),
      ...(anyLive && truck.featuredAt ? { lastRefreshedAt: truck.featuredAt.toISOString() } : {}),
      area: {
        maxDays: onSale,
        brackets: AREA_PROMOTION_PRICE_BRACKETS,
        ...(areaLive && truck.areaFeaturedUntil
          ? { activeUntil: truck.areaFeaturedUntil.toISOString() }
          : {}),
      },
    }

    if (!subscribed) status.blockedReason = 'no-subscription'
    return status
  }

  /**
   * The driver's own placement orders, newest first, every status — the same
   * "what did I ask for and did it go through" list the subscription block has.
   *
   * A row missing its scope or day count cannot exist (the CHECK constraint),
   * so the fallbacks are only there to keep a history renderable rather than
   * to mean anything.
   */
  async listOwnPayments(towTruckId: number): Promise<PromotionPaymentApi[]> {
    const rows = await this.subscriptionsRepository.findOwnPromotions(towTruckId)
    return rows.map((row) => ({
      id: row.id,
      scope: row.promotionScope ?? PromotionScope.HOME,
      days: row.promotionDays ?? 0,
      title: promotionPaymentTitle(row.promotionScope, row.promotionDays),
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }))
  }

  /**
   * «Վճարել» — records the order and hands back the form that pays it. No money
   * has moved and nothing is granted; the provider's callback does both.
   *
   * Every rule is checked again here. The status call is what the page renders
   * from, not what the server trusts.
   */
  async createPayment(
    towTruckId: number,
    days: number,
    scope: PromotionScope = PromotionScope.HOME,
    now: Date = new Date(),
  ): Promise<CreatedPromotionPaymentApi> {
    const status = await this.getStatus(towTruckId, now)
    const maxDays = scope === PromotionScope.AREA ? status.area.maxDays : status.maxDays
    if (!status.visible) {
      throw new ConflictException('Ձեր էջը ապաակտիվացված է')
    }
    if (status.blockedReason === 'not-listed') {
      throw new ConflictException(
        'Ձեր տեխնիկայի տեսակը քաղաքների էջերում չի ցուցադրվում, առաջխաղացումը հասանելի չէ',
      )
    }
    if (scope === PromotionScope.HOME && !status.homeAvailable) {
      throw new ConflictException(
        '«Իմ քաղաքում վերևում» հասանելի է միայն քաղաքում կամ Երևանի շրջանում գրանցված վարորդին',
      )
    }
    if (status.blockedReason === 'no-subscription') {
      throw new ConflictException(
        'Առաջխաղացում գնելու համար նախ պետք է ակտիվ բաժանորդագրություն ունենաք',
      )
    }
    if (maxDays === 0) {
      throw new ConflictException(
        'Առաջխաղացումն արդեն հասնում է բաժանորդագրության վերջին օրվան',
      )
    }
    if (days > maxDays) {
      // Named rather than clamped: a driver who asked for thirty days and was
      // quietly sold nine would find out from their receipt.
      throw new BadRequestException(
        `Այս պահին կարող եք գնել առավելագույնը ${maxDays} օր — ` +
          'առաջխաղացումը չի կարող գերազանցել բաժանորդագրության ժամկետը',
      )
    }

    const amount = promotionPrice(days, scope)
    // Unreachable through the DTO, which bounds 1–30. Checked because this is
    // the number the driver will be charged.
    if (amount === null) throw new BadRequestException(`Օրերի քանակը պետք է լինի 1–${FEATURED_MAX_DAYS}`)

    // Supersedes any older unpaid order of this driver (see
    // `createPromotion`): only the newest is payable, and the provider's
    // precheck re-validates it (`isStillGrantable`), so two orders can never
    // together run past the subscription.
    const payment = await this.subscriptionsRepository.createPromotion(towTruckId, {
      days,
      scope,
      amount,
      currency: PROMOTION_CURRENCY,
    })

    this.logger.log(
      `Promotion payment #${payment.id} requested by TowTruck #${towTruckId}: ` +
        `${scope}, ${days} days, ${amount} ${PROMOTION_CURRENCY} (PENDING)`,
    )

    return {
      id: payment.id,
      towTruckId: payment.towTruckId,
      days,
      scope,
      amount,
      currency: PROMOTION_CURRENCY,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      // The row exists BEFORE the driver is handed over, for the same reason it
      // does on a subscription: the provider's first callback asks whether this
      // bill is a real order, and there would be nothing to answer with.
      gateway: this.idram.paymentForm(payment.id, amount, promotionPaymentTitle(scope, days)),
    }
  }

  /**
   * Idram's precheck asks "is this still a real order?" right before taking the
   * money. For a placement that also means "would we still sell it?" — the
   * driver may have been deactivated, their subscription may have run out, or
   * time may have passed since the order was made. Refusing here costs
   * nothing: no money has moved yet.
   *
   * Reads only; the precheck is unauthenticated and must stay write-free.
   */
  async isStillGrantable(
    payment: {
      towTruckId: number
      promotionDays: number | null
      promotionScope: PromotionScope | null
      createdAt: Date
    },
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!payment.promotionDays || !payment.promotionScope) return false

    // Can we still sell to this driver at all — right now.
    const current = await this.getStatus(payment.towTruckId, now)
    if (!current.visible || current.blockedReason) return false

    // Does the order still fit — measured at the moment it was MADE, against
    // today's windows. `maxDays` is whole days, floored, so measuring at `now`
    // would refuse a driver who bought the maximum and spent five minutes on
    // the Idram page: 7 days and 2 minutes left becomes 6 days and 23 hours.
    // The windows are read fresh, so anything granted since (an admin's
    // extension) still counts against the order.
    const atOrder = await this.getStatus(payment.towTruckId, payment.createdAt)
    const maxDays =
      payment.promotionScope === PromotionScope.AREA ? atOrder.area.maxDays : atOrder.maxDays
    return payment.promotionDays <= maxDays
  }

  /**
   * The provider says the money arrived. This is the only thing that grants
   * days — not the driver returning to the site, which they may never do.
   *
   * Returns false when there was nothing to confirm (a retry of a callback
   * already handled), which the caller reports to the gateway as success.
   */
  async confirmPayment(
    paymentId: number,
    source?: { provider: string; transactionId: string },
    now: Date = new Date(),
  ): Promise<boolean> {
    const payment = await this.subscriptionsRepository.findById(paymentId)
    // Both halves checked, not just the day count: `kind` is what the caller
    // routed on, and `promotionDays` is what this method is about to grant.
    // A row that satisfies one and not the other cannot exist (the CHECK
    // constraint says so) — which is exactly why reaching here with one means
    // something upstream is wrong and guessing would be the wrong answer.
    if (
      !payment ||
      payment.kind !== PaymentKind.PROMOTION ||
      !payment.promotionDays ||
      !payment.promotionScope
    ) {
      return false
    }

    const confirmed = await this.subscriptionsRepository.confirmPromotion(
      paymentId,
      payment.towTruckId,
      { days: payment.promotionDays, scope: payment.promotionScope },
      now,
      source,
    )
    if (!confirmed) return false

    this.logger.warn(
      `Promotion confirmed: payment #${paymentId}, TowTruck #${payment.towTruckId}, ` +
        `${payment.promotionScope}, ${payment.promotionDays} days, ${payment.amount} ${payment.currency}` +
        `${source ? ` (${source.provider} ${source.transactionId})` : ''}`,
    )
    return true
  }

  /**
   * «Թարմացնել» — back to the top of the town's promoted block.
   *
   * The check and the spend are one UPDATE (see
   * `TowTrucksRepository.refreshPromotion`), so a double-tap cannot spend two
   * refreshes or none. When it changes nothing, the status read below is what
   * turns "no rows updated" into a sentence the driver can act on.
   */
  async refresh(towTruckId: number, now: Date = new Date()): Promise<PromotionStatusApi> {
    const refreshed = await this.towTrucksRepository.refreshPromotion(
      towTruckId,
      now,
      armeniaDateKey(now),
      PROMOTION_BUMPS_PER_DAY,
    )

    const status = await this.getStatus(towTruckId, now)
    if (refreshed) return status

    if (!status.visible) throw new ConflictException('Ձեր էջը ապաակտիվացված է')
    if (!status.activeUntil && !status.area.activeUntil) {
      throw new ConflictException('Ակտիվ առաջխաղացում չունեք')
    }
    throw new ConflictException(
      `Այսօրվա թարմացումներն սպառված են (օրական ${PROMOTION_BUMPS_PER_DAY})`,
    )
  }

  /** Refreshes left today. A stored day that is not today reads as none spent. */
  private refreshesLeft(
    truck: { promotionBumpDay: string | null; promotionBumpCount: number },
    now: Date,
  ): number {
    const spent = truck.promotionBumpDay === armeniaDateKey(now) ? truck.promotionBumpCount : 0
    return Math.max(0, PROMOTION_BUMPS_PER_DAY - spent)
  }

  /**
   * How many days are still on sale, bounded by the subscription.
   *
   * Measured from where the placement WOULD start — the latest end of the live
   * windows it queues behind, or now — because that is the day the driver is
   * buying from. A driver with a week of placement left and a month of
   * subscription can buy the three weeks in between, and not an hour more.
   *
   * `queuedBehind` holds only LIVE windows' ends (null for anything not
   * running), so an expired date can never push the start into the past.
   */
  private maxDays(queuedBehind: readonly (Date | null)[], paidThrough: Date, now: Date): number {
    const start = queuedBehind.reduce<Date>(
      (latest, end) => (end && end.getTime() > latest.getTime() ? end : latest),
      now,
    )
    const whole = Math.floor((paidThrough.getTime() - start.getTime()) / DAY_MS)
    return Math.max(0, Math.min(whole, FEATURED_MAX_DAYS))
  }
}
