import 'reflect-metadata'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { SubscriptionPaymentStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { AdminSubscriptionsService } from '../src/subscriptions/admin-subscriptions.service'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'

/**
 * The admin half of subscriptions: confirming what a driver asked for, and
 * recording money that arrived off-platform.
 *
 * Two properties carry the weight here. **An admin picks a plan, never an
 * amount** — so the two ways a payment can be recorded (driver request, admin
 * grant) can never disagree about what a month costs. And **a confirmation
 * extends coverage rather than restarting it**, so renewing early is not a
 * penalty.
 */

interface FakeRepos {
  service: AdminSubscriptionsService
  created: { towTruckId: number; data: Record<string, unknown> }[]
  confirmed: { id: number; start: Date; end: Date }[]
}

function build(options: {
  paidUntil?: Date | null
  payment?: { id: number; towTruckId: number; durationMonths: number; status: SubscriptionPaymentStatus } | null
  truckExists?: boolean
  alreadyReviewed?: boolean
} = {}) {
  const created: FakeRepos['created'] = []
  const confirmed: FakeRepos['confirmed'] = []
  const reviewed: number[] = []
  const sweep = { cancelled: 0 }

  /** A complete row, because `toSubscriptionPaymentApi` reads every field */
  const fullPayment = () => ({
    id: options.payment?.id ?? 5,
    towTruckId: options.payment?.towTruckId ?? 7,
    planCode: 'ONE_MONTH',
    planTitle: '1 ամսվա բաժանորդագրություն',
    amount: 3000,
    currency: 'AMD',
    durationMonths: options.payment?.durationMonths ?? 1,
    periodStart: new Date(),
    periodEnd: new Date(),
    status: options.payment?.status ?? SubscriptionPaymentStatus.PAID,
    reviewedAt: null,
    provider: null,
    providerTransactionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const subscriptions = {
    findById: vi.fn(async () => (options.payment === null ? null : { ...fullPayment() })),
    findCoverage: vi.fn(async (ids: number[]) => {
      const map = new Map()
      for (const id of ids) {
        map.set(id, { towTruckId: id, paidUntil: options.paidUntil ?? null, lastPaidAt: null, pendingCount: 0 })
      }
      return map
    }),
    create: vi.fn(async (towTruckId: number, data: Record<string, unknown>) => {
      created.push({ towTruckId, data })
      return { id: 1, towTruckId, ...data, createdAt: new Date(), updatedAt: new Date() }
    }),
    confirm: vi.fn(async (id: number, period: { start: Date; end: Date }) => {
      confirmed.push({ id, start: period.start, end: period.end })
      return {
        id,
        towTruckId: options.payment?.towTruckId ?? 1,
        planCode: 'ONE_MONTH',
        amount: 3000,
        currency: 'AMD',
        durationMonths: options.payment?.durationMonths ?? 1,
        periodStart: period.start,
        periodEnd: period.end,
        status: SubscriptionPaymentStatus.PAID,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }),
    markReviewed: vi.fn(async (id: number) => {
      // Mirrors the real guard: a row already reviewed matches nothing, and
      // the service must treat that as "already done", not as a failure.
      if (options.alreadyReviewed) return null
      reviewed.push(id)
      return { ...fullPayment(), id, reviewedAt: new Date() }
    }),
    cancelAbandonedPending: vi.fn(async () => {
      sweep.cancelled += 1
      return 1
    }),
  } as unknown as SubscriptionsRepository

  const trucks = {
    findById: vi.fn(async () => (options.truckExists === false ? null : { id: 7 })),
  } as unknown as TowTrucksRepository

  return {
    service: new AdminSubscriptionsService(subscriptions, trucks, { afterPayment: async () => {} } as never),
    created,
    confirmed,
    reviewed,
    sweep,
  }
}

describe('AdminSubscriptionsService.grant', () => {
  it('takes the amount and the duration from the plan, not from the admin', async () => {
    const { service, created } = build()
    await service.grant(7, 'FOUR_MONTHS')

    expect(created[0]!.data).toMatchObject({
      planCode: 'FOUR_MONTHS',
      amount: 10000,
      currency: 'AMD',
      durationMonths: 4,
      status: SubscriptionPaymentStatus.PAID,
    })
  })

  it('records it as PAID — this is money that already arrived', async () => {
    const { service, created } = build()
    await service.grant(7, 'ONE_MONTH')
    expect(created[0]!.data.status).toBe(SubscriptionPaymentStatus.PAID)
  })

  it('starts the period at the date the admin chose, not at "now"', async () => {
    const { service, created } = build()
    const later = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    await service.grant(7, 'ONE_MONTH', later)
    expect((created[0]!.data.periodStart as Date).toISOString()).toBe(later)
  })

  it('extends existing coverage instead of restarting it', async () => {
    // A driver who renews a week early must not lose that week.
    const paidUntil = new Date('2027-01-15T09:00:00.000Z')
    const { service, created } = build({ paidUntil })
    await service.grant(7, 'ONE_MONTH')

    expect((created[0]!.data.periodStart as Date).toISOString()).toBe(paidUntil.toISOString())
    expect((created[0]!.data.periodEnd as Date).toISOString()).toBe('2027-02-15T09:00:00.000Z')
  })

  it('refuses a payment date in the past', async () => {
    // A back-dated start silently sells less than the plan says — a month
    // bought from three weeks ago is a week of coverage — and far enough back
    // it records a subscription that is already expired.
    const { service, created } = build()
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    await expect(service.grant(7, 'ONE_MONTH', lastWeek)).rejects.toBeInstanceOf(BadRequestException)
    expect(created).toHaveLength(0)
  })

  it('accepts a date in the future — paid now, starts later', async () => {
    const { service, created } = build()
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await service.grant(7, 'ONE_MONTH', nextMonth)
    expect(created).toHaveLength(1)
  })

  it("accepts today's own date whatever the hour", async () => {
    // Compared by Armenia's calendar DAY, not by instant: `new Date('...')` at
    // midnight UTC is 04:00 in Yerevan, so an instant comparison would reject
    // today for the first four hours of every Armenian day.
    const { service, created } = build()
    const now = new Date()
    const todayMidnightUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString()

    await service.grant(7, 'ONE_MONTH', todayMidnightUtc)
    expect(created).toHaveLength(1)
  })

  it('refuses a plan that is not on sale', async () => {
    const { service, created } = build()
    await expect(service.grant(7, 'FREE_FOREVER')).rejects.toBeInstanceOf(BadRequestException)
    expect(created).toHaveLength(0)
  })

  it('refuses a driver that does not exist', async () => {
    const { service, created } = build({ truckExists: false })
    await expect(service.grant(999, 'ONE_MONTH')).rejects.toBeInstanceOf(NotFoundException)
    expect(created).toHaveLength(0)
  })
})

describe('AdminSubscriptionsService.review', () => {
  const paid = {
    id: 5,
    towTruckId: 7,
    durationMonths: 4,
    status: SubscriptionPaymentStatus.PAID,
  }

  it('ticks a completed payment off the list', async () => {
    const { service, reviewed } = build({ payment: paid })
    await service.review(5)
    expect(reviewed).toEqual([5])
  })

  it('grants and revokes nothing — the money was already in', async () => {
    // The whole point of the change: a driver is active the moment the
    // provider confirms, and «Հաստատել» is an admin saying they have seen it.
    // If this ever starts touching coverage, it has become a decision again.
    const { service, confirmed, created } = build({ payment: paid })
    await service.review(5)
    expect(confirmed).toHaveLength(0)
    expect(created).toHaveLength(0)
  })

  it('is not an error to review twice', async () => {
    // Two admins working the same list is ordinary. The second should find the
    // row gone, not a conflict.
    const { service } = build({ payment: paid, alreadyReviewed: true })
    await expect(service.review(5)).resolves.toMatchObject({ id: 5 })
  })

  it('refuses a payment that never completed', async () => {
    // Only PAID rows reach the list at all; anything else here means the
    // caller invented an id.
    const { service } = build({
      payment: { ...paid, status: SubscriptionPaymentStatus.PENDING },
    })
    await expect(service.review(5)).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuses a payment that does not exist', async () => {
    const { service } = build({ payment: null })
    await expect(service.review(404)).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('AdminSubscriptionsService.cancelAbandoned', () => {
  it('writes off unfinished requests without touching anything else', async () => {
    // A PENDING row is created before the driver ever reaches the provider, so
    // most of them are people who changed their mind. Nothing about clearing
    // them may grant or revoke coverage.
    const { service, confirmed, sweep } = build()
    await service.cancelAbandoned()

    expect(sweep.cancelled).toBe(1)
    expect(confirmed).toHaveLength(0)
  })
})
