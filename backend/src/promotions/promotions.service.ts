import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import { armeniaDateKey } from '../common/armenia-day'
import { IdramService } from '../idram/idram.service'
import { SubscriptionsRepository } from '../subscriptions/subscriptions.repository'
import { FEATURED_MAX_DAYS, isFeaturedNow } from '../tow-trucks/featured'
import { TowTrucksRepository } from '../tow-trucks/tow-trucks.repository'
import {
  PROMOTION_BUMPS_PER_DAY,
  PROMOTION_CURRENCY,
  PROMOTION_PRICE_BRACKETS,
  promotionPrice,
} from './promotion-pricing'
import type { CreatedPromotionPaymentApi, PromotionStatusApi } from './promotion.types'

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

    if (!truck.isActive) {
      return { ...base, visible: false, blockedReason: 'inactive', refreshesLeft: 0, maxDays: 0 }
    }

    const live = isFeaturedNow(truck, now)
    const coverage = await this.subscriptionsRepository.findCoverage([towTruckId])
    // `paidThrough`, not `coveredUntil`: coverage also counts the deadline an
    // admin gives a driver who has NOT paid, and "you have until Friday to pay"
    // is not a subscription to hang a placement on.
    const paidThrough = coverage.get(towTruckId)?.paidThrough ?? null
    const subscribed = paidThrough !== null && paidThrough.getTime() > now.getTime()

    const status: PromotionStatusApi = {
      ...base,
      visible: true,
      refreshesLeft: live ? this.refreshesLeft(truck, now) : 0,
      maxDays: subscribed ? this.maxDays(truck.featuredUntil, paidThrough, now, live) : 0,
      ...(live && truck.featuredUntil ? { activeUntil: truck.featuredUntil.toISOString() } : {}),
      ...(live && truck.featuredAt ? { lastRefreshedAt: truck.featuredAt.toISOString() } : {}),
    }

    if (!subscribed) status.blockedReason = 'no-subscription'
    return status
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
    now: Date = new Date(),
  ): Promise<CreatedPromotionPaymentApi> {
    const status = await this.getStatus(towTruckId, now)
    if (!status.visible) {
      throw new ConflictException('Ձեր էջը ապաակտիվացված է')
    }
    if (status.blockedReason === 'no-subscription') {
      throw new ConflictException(
        'Առաջխաղացում գնելու համար նախ պետք է ակտիվ բաժանորդագրություն ունենաք',
      )
    }
    if (status.maxDays === 0) {
      throw new ConflictException(
        'Առաջխաղացումն արդեն հասնում է բաժանորդագրության վերջին օրվան',
      )
    }
    if (days > status.maxDays) {
      // Named rather than clamped: a driver who asked for thirty days and was
      // quietly sold nine would find out from their receipt.
      throw new BadRequestException(
        `Այս պահին կարող եք գնել առավելագույնը ${status.maxDays} օր — ` +
          'առաջխաղացումը չի կարող գերազանցել բաժանորդագրության ժամկետը',
      )
    }

    const amount = promotionPrice(days)
    // Unreachable through the DTO, which bounds 1–30. Checked because this is
    // the number the driver will be charged.
    if (amount === null) throw new BadRequestException(`Օրերի քանակը պետք է լինի 1–${FEATURED_MAX_DAYS}`)

    const payment = await this.subscriptionsRepository.createPromotion(towTruckId, {
      days,
      amount,
      currency: PROMOTION_CURRENCY,
    })

    this.logger.log(
      `Promotion payment #${payment.id} requested by TowTruck #${towTruckId}: ` +
        `${days} days, ${amount} ${PROMOTION_CURRENCY} (PENDING)`,
    )

    return {
      id: payment.id,
      towTruckId: payment.towTruckId,
      days,
      amount,
      currency: PROMOTION_CURRENCY,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      // The row exists BEFORE the driver is handed over, for the same reason it
      // does on a subscription: the provider's first callback asks whether this
      // bill is a real order, and there would be nothing to answer with.
      gateway: this.idram.paymentForm(payment.id, amount, `Առաջխաղացում ${days} օր`),
    }
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
    if (!payment?.promotionDays) return false

    const confirmed = await this.subscriptionsRepository.confirmPromotion(
      paymentId,
      payment.towTruckId,
      payment.promotionDays,
      now,
      source,
    )
    if (!confirmed) return false

    this.logger.warn(
      `Promotion confirmed: payment #${paymentId}, TowTruck #${payment.towTruckId}, ` +
        `${payment.promotionDays} days, ${payment.amount} ${payment.currency}` +
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
    if (!status.activeUntil) throw new ConflictException('Ակտիվ առաջխաղացում չունեք')
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
   * Measured from where the placement WOULD start — the end of a running one,
   * or now — because that is the day the driver is buying from. A driver with a
   * week of placement left and a month of subscription can buy the three weeks
   * in between, and not an hour more.
   */
  private maxDays(
    featuredUntil: Date | null,
    paidThrough: Date,
    now: Date,
    live: boolean,
  ): number {
    const start = live && featuredUntil ? featuredUntil : now
    const whole = Math.floor((paidThrough.getTime() - start.getTime()) / DAY_MS)
    return Math.max(0, Math.min(whole, FEATURED_MAX_DAYS))
  }
}
