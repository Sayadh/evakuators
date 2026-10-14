import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { PromotionsService } from '../src/promotions/promotions.service'
import { PROMOTION_BUMPS_PER_DAY } from '../src/promotions/promotion-pricing'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import type { IdramService } from '../src/idram/idram.service'

/**
 * Buying and refreshing a placement.
 *
 * The three rules are the subject, and all three are enforced on the WRITE as
 * well as the read — the status call is what the page renders from, not what
 * the server trusts:
 *
 *   a deactivated listing has no block at all;
 *   no live subscription, nothing for sale;
 *   a placement may not outlive the subscription it decorates.
 *
 * The third is the one with arithmetic in it, so it gets the most cases.
 */
const NOW = new Date('2026-10-13T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function build(options: {
  isActive?: boolean
  featuredUntil?: Date | null
  areaFeaturedUntil?: Date | null
  featuredAt?: Date | null
  isFeatured?: boolean
  paidThrough?: Date | null
  bumpDay?: string | null
  bumpCount?: number
  refreshed?: boolean
  scope?: 'HOME' | 'AREA'
  pending?: boolean
} = {}) {
  const truck = {
    id: 7,
    isActive: options.isActive ?? true,
    isFeatured: options.isFeatured ?? options.featuredUntil !== undefined,
    featuredAt: options.featuredAt ?? null,
    featuredUntil: options.featuredUntil ?? null,
    areaFeaturedUntil: options.areaFeaturedUntil ?? null,
    promotionBumpDay: options.bumpDay ?? null,
    promotionBumpCount: options.bumpCount ?? 0,
  }

  const createPromotion = vi.fn(async (towTruckId: number, data: { days: number; amount: number }) => ({
    id: 99,
    towTruckId,
    promotionDays: data.days,
    amount: data.amount,
    status: 'PENDING',
    createdAt: NOW,
  }))
  const confirmPromotion = vi.fn(async () => ({ id: 99 }))
  const hasRecentPendingPromotion = vi.fn(async () => options.pending ?? false)
  const refreshPromotion = vi.fn(async () => options.refreshed ?? true)
  const extendPromotion = vi.fn(async () => undefined)

  const service = new PromotionsService(
    {
      findById: vi.fn(async () => truck),
      refreshPromotion,
      extendPromotion,
    } as unknown as TowTrucksRepository,
    {
      findCoverage: vi.fn(async () =>
        new Map([[7, { paidThrough: options.paidThrough ?? null }]]),
      ),
      createPromotion,
      confirmPromotion,
      hasRecentPendingPromotion,
      findOwnPromotions: vi.fn(async () => [
        {
          id: 12,
          kind: 'PROMOTION',
          promotionScope: 'AREA',
          promotionDays: 7,
          amount: 4500,
          currency: 'AMD',
          status: 'PAID',
          createdAt: NOW,
        },
      ]),
      findById: vi.fn(async () => ({
        id: 99,
        towTruckId: 7,
        kind: 'PROMOTION',
        promotionDays: 5,
        promotionScope: options.scope ?? 'HOME',
        amount: 2000,
        currency: 'AMD',
      })),
    } as unknown as SubscriptionsRepository,
    { paymentForm: vi.fn(() => ({ action: 'https://idram' })) } as unknown as IdramService,
  )

  return { service, createPromotion, confirmPromotion, refreshPromotion, hasRecentPendingPromotion }
}

const inDays = (days: number) => new Date(NOW.getTime() + days * DAY)

describe('the promotion block’s three rules', () => {
  it('shows nothing at all to a deactivated listing', async () => {
    // Not disabled — absent. The driver is off the site; selling them a
    // position on it would be taking money for something nobody can see.
    const { service } = build({ isActive: false, paidThrough: inDays(30) })

    const status = await service.getStatus(7, NOW)

    expect(status.visible).toBe(false)
    expect(status.blockedReason).toBe('inactive')
    expect(status.maxDays).toBe(0)
  })

  it('shows the block, and sells nothing, without a live subscription', async () => {
    // Shown and explained: the fix is one screen away, and hiding the block
    // would leave the driver wondering where the feature went.
    const { service } = build({ paidThrough: null })

    const status = await service.getStatus(7, NOW)

    expect(status.visible).toBe(true)
    expect(status.blockedReason).toBe('no-subscription')
    expect(status.maxDays).toBe(0)
  })

  it('treats an expired subscription as no subscription', async () => {
    const { service } = build({ paidThrough: inDays(-1) })
    expect((await service.getStatus(7, NOW)).blockedReason).toBe('no-subscription')
  })

  it('does not count an admin’s payment deadline as a subscription', async () => {
    // `findCoverage` also carries `paymentDueAt` — "you have until Friday to
    // pay". That is a request for money, not money, and nothing to hang a
    // placement on. This service reads `paidThrough` for exactly that reason.
    const { service } = build({ paidThrough: null })
    expect((await service.getStatus(7, NOW)).maxDays).toBe(0)
  })

  it('stops the placement at the subscription’s last day', async () => {
    const { service } = build({ paidThrough: inDays(9) })
    expect((await service.getStatus(7, NOW)).maxDays).toBe(9)
  })

  it('never offers more than the thirty days that exist', async () => {
    const { service } = build({ paidThrough: inDays(400) })
    expect((await service.getStatus(7, NOW)).maxDays).toBe(30)
  })

  it('measures from the end of a placement already running', async () => {
    // A driver with a week left and a month of subscription is buying the three
    // weeks in between — extending, not starting over.
    const { service } = build({ paidThrough: inDays(30), featuredUntil: inDays(7) })
    expect((await service.getStatus(7, NOW)).maxDays).toBe(23)
  })

  it('offers nothing once the placement already reaches the subscription’s end', async () => {
    const { service } = build({ paidThrough: inDays(10), featuredUntil: inDays(10) })
    expect((await service.getStatus(7, NOW)).maxDays).toBe(0)
  })
})

describe('buying a placement', () => {
  it('refuses more days than the subscription has left, by name', async () => {
    // Named rather than clamped: a driver who asked for thirty days and was
    // quietly sold nine would find out from their receipt.
    const { service, createPromotion } = build({ paidThrough: inDays(9) })

    await expect(service.createPayment(7, 30, 'HOME', NOW)).rejects.toThrow(/9 օր/)
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('refuses a deactivated listing and an unsubscribed one', async () => {
    const off = build({ isActive: false, paidThrough: inDays(30) })
    await expect(off.service.createPayment(7, 1, 'HOME', NOW)).rejects.toThrow()

    const unpaid = build({ paidThrough: null })
    await expect(unpaid.service.createPayment(7, 1, 'HOME', NOW)).rejects.toThrow()
    expect(unpaid.createPromotion).not.toHaveBeenCalled()
  })

  it('prices the order from the ladder, never from the request', async () => {
    const { service, createPromotion } = build({ paidThrough: inDays(30) })

    const created = await service.createPayment(7, 17, 'HOME', NOW)

    expect(created.amount).toBe(4_550)
    expect(createPromotion).toHaveBeenCalledWith(7, {
      days: 17,
      scope: 'HOME',
      amount: 4_550,
      currency: 'AMD',
    })
  })

  it('creates the row before handing the driver to the gateway', async () => {
    // The provider's first callback asks whether this bill is a real order.
    // Without the row there would be nothing to answer with.
    const { service } = build({ paidThrough: inDays(30) })
    const created = await service.createPayment(7, 3, 'HOME', NOW)

    expect(created.id).toBe(99)
    expect(created.gateway).toBeDefined()
  })
})

describe('confirming a placement payment', () => {
  it('grants the days the row says, not the days the callback says', async () => {
    const { service, confirmPromotion } = build()

    await expect(
      service.confirmPayment(99, { provider: 'IDRAM', transactionId: 't1' }, NOW),
    ).resolves.toBe(true)

    expect(confirmPromotion).toHaveBeenCalledWith(99, 7, { days: 5, scope: 'HOME' }, NOW, {
      provider: 'IDRAM',
      transactionId: 't1',
    })
  })

  it('reports nothing-to-do when the repository found it already confirmed', async () => {
    // A gateway retries a callback it did not hear OK from. The second attempt
    // must add no days — and must not look like a failure either.
    const { service } = build()
    const confirmed = await service.confirmPayment(99, undefined, NOW)
    expect(confirmed).toBe(true)
  })
})

describe('refreshing', () => {
  it('returns the fresh status when a refresh was spent', async () => {
    const { service } = build({
      paidThrough: inDays(30),
      featuredUntil: inDays(5),
      refreshed: true,
    })

    const status = await service.refresh(7, NOW)

    expect(status.refreshesPerDay).toBe(PROMOTION_BUMPS_PER_DAY)
    expect(status.activeUntil).toBeDefined()
  })

  it('says the allowance is spent rather than failing silently', async () => {
    // The UPDATE is the check AND the spend, so "no rows changed" is all the
    // database says. Turning that into a sentence is this method's other job.
    const { service } = build({
      paidThrough: inDays(30),
      featuredUntil: inDays(5),
      refreshed: false,
    })

    await expect(service.refresh(7, NOW)).rejects.toThrow(/թարմացումներ/)
  })

  it('says there is no placement when there is none', async () => {
    const { service } = build({ paidThrough: inDays(30), refreshed: false })
    await expect(service.refresh(7, NOW)).rejects.toThrow(/Ակտիվ առաջխաղացում/)
  })

  it('counts a stored day that is not today as nothing spent', async () => {
    const { service } = build({
      paidThrough: inDays(30),
      featuredUntil: inDays(5),
      bumpDay: '2026-10-12',
      bumpCount: PROMOTION_BUMPS_PER_DAY,
    })

    expect((await service.getStatus(7, NOW)).refreshesLeft).toBe(PROMOTION_BUMPS_PER_DAY)
  })

  it('offers no refreshes at all when no placement is running', async () => {
    const { service } = build({ paidThrough: inDays(30) })
    expect((await service.getStatus(7, NOW)).refreshesLeft).toBe(0)
  })
})

describe('the «Ամբողջ սպասարկման տարածքում» product', () => {
  it('prices from its own, dearer ladder', async () => {
    const { service, createPromotion } = build({ paidThrough: inDays(30) })

    const created = await service.createPayment(7, 30, 'AREA', NOW)

    expect(created.amount).toBe(11_000)
    expect(created.scope).toBe('AREA')
    expect(createPromotion).toHaveBeenCalledWith(7, {
      days: 30,
      scope: 'AREA',
      amount: 11_000,
      currency: 'AMD',
    })
  })

  it('is bounded by the subscription like the home product', async () => {
    const { service, createPromotion } = build({ paidThrough: inDays(9) })
    await expect(service.createPayment(7, 10, 'AREA', NOW)).rejects.toThrow(/9 օր/)
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('measures from the end of its own running window', async () => {
    const { service } = build({ paidThrough: inDays(30), areaFeaturedUntil: inDays(12) })
    const status = await service.getStatus(7, NOW)
    expect(status.area.maxDays).toBe(18)
    expect(status.area.activeUntil).toBe(inDays(12).toISOString())
  })

  it('makes home days start after it — the area product already holds the home top', async () => {
    const { service } = build({ paidThrough: inDays(30), areaFeaturedUntil: inDays(12) })
    expect((await service.getStatus(7, NOW)).maxDays).toBe(18)
  })

  it('does not shrink because a home placement is running', async () => {
    const { service } = build({ paidThrough: inDays(30), featuredUntil: inDays(20) })
    const status = await service.getStatus(7, NOW)
    expect(status.maxDays).toBe(10)
    expect(status.area.maxDays).toBe(30)
  })

  it('ignores an expired window', async () => {
    const { service } = build({ paidThrough: inDays(30), areaFeaturedUntil: inDays(-3) })
    const status = await service.getStatus(7, NOW)
    expect(status.area.activeUntil).toBeUndefined()
    expect(status.area.maxDays).toBe(30)
    expect(status.refreshesLeft).toBe(0)
  })

  it('opens the refresh allowance on its own', async () => {
    const { service } = build({ paidThrough: inDays(30), areaFeaturedUntil: inDays(5) })
    expect((await service.getStatus(7, NOW)).refreshesLeft).toBe(PROMOTION_BUMPS_PER_DAY)
  })

  it('grants the scope the row says', async () => {
    const { service, confirmPromotion } = build({ scope: 'AREA' })
    await service.confirmPayment(99, undefined, NOW)
    expect(confirmPromotion).toHaveBeenCalledWith(99, 7, { days: 5, scope: 'AREA' }, NOW, undefined)
  })
})

describe('one order in flight', () => {
  it('refuses a second order while the first is still unpaid, by name', async () => {
    // Two unpaid orders paid one after the other could together run past the
    // subscription's end — `maxDays` only knows what was already granted.
    const { service, createPromotion } = build({ paidThrough: inDays(30), pending: true })
    await expect(service.createPayment(7, 3, 'AREA', NOW)).rejects.toThrow(/ընթացքի մեջ/)
    expect(createPromotion).not.toHaveBeenCalled()
  })

  it('looks back exactly the lock window', async () => {
    const { service, hasRecentPendingPromotion } = build({ paidThrough: inDays(30) })
    await service.createPayment(7, 3, 'HOME', NOW)
    expect(hasRecentPendingPromotion).toHaveBeenCalledWith(7, new Date(NOW.getTime() - 30 * 60 * 1000))
  })
})

describe('the driver’s own history', () => {
  it('lists each order with the product, the days and the status', async () => {
    const { service } = build()
    await expect(service.listOwnPayments(7)).resolves.toEqual([
      {
        id: 12,
        scope: 'AREA',
        days: 7,
        title: 'Առաջխաղացում · Ամբողջ սպասարկման տարածքում · 7 օր',
        amount: 4500,
        currency: 'AMD',
        status: 'PAID',
        createdAt: NOW.toISOString(),
      },
    ])
  })
})
