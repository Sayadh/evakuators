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
} = {}): FakeRepos {
  const created: FakeRepos['created'] = []
  const confirmed: FakeRepos['confirmed'] = []

  const subscriptions = {
    findById: vi.fn(async () => options.payment ?? null),
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
    setStatus: vi.fn(async (id: number) => ({
      id,
      towTruckId: 1,
      planCode: 'ONE_MONTH',
      amount: 3000,
      currency: 'AMD',
      durationMonths: 1,
      periodStart: new Date(),
      periodEnd: new Date(),
      status: SubscriptionPaymentStatus.CANCELLED,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  } as unknown as SubscriptionsRepository

  const trucks = {
    findById: vi.fn(async () => (options.truckExists === false ? null : { id: 7 })),
  } as unknown as TowTrucksRepository

  return { service: new AdminSubscriptionsService(subscriptions, trucks), created, confirmed }
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
    await service.grant(7, 'ONE_MONTH', '2026-08-01T09:00:00.000Z')
    expect((created[0]!.data.periodStart as Date).toISOString()).toBe('2026-08-01T09:00:00.000Z')
  })

  it('extends existing coverage instead of restarting it', async () => {
    // A driver who renews a week early must not lose that week.
    const paidUntil = new Date('2027-01-15T09:00:00.000Z')
    const { service, created } = build({ paidUntil })
    await service.grant(7, 'ONE_MONTH')

    expect((created[0]!.data.periodStart as Date).toISOString()).toBe(paidUntil.toISOString())
    expect((created[0]!.data.periodEnd as Date).toISOString()).toBe('2027-02-15T09:00:00.000Z')
  })

  it('refuses a payment date in the future', async () => {
    const { service, created } = build()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await expect(service.grant(7, 'ONE_MONTH', tomorrow)).rejects.toBeInstanceOf(BadRequestException)
    expect(created).toHaveLength(0)
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

describe('AdminSubscriptionsService.decide', () => {
  const pending = {
    id: 5,
    towTruckId: 7,
    durationMonths: 4,
    status: SubscriptionPaymentStatus.PENDING,
  }

  it('recomputes the period on confirmation rather than honouring the quote', async () => {
    // The window written when the driver pressed «Վճարել» was a quote. Days
    // may have passed; honouring it would sell less than the plan says.
    const { service, confirmed } = build({ payment: pending })
    await service.decide(5, SubscriptionPaymentStatus.PAID)

    expect(confirmed).toHaveLength(1)
    const months =
      (confirmed[0]!.end.getUTCFullYear() - confirmed[0]!.start.getUTCFullYear()) * 12 +
      (confirmed[0]!.end.getUTCMonth() - confirmed[0]!.start.getUTCMonth())
    expect(months).toBe(4)
  })

  it('extends from existing coverage when confirming', async () => {
    const paidUntil = new Date('2027-03-01T09:00:00.000Z')
    const { service, confirmed } = build({ payment: pending, paidUntil })
    await service.decide(5, SubscriptionPaymentStatus.PAID)
    expect(confirmed[0]!.start.toISOString()).toBe(paidUntil.toISOString())
  })

  it('cancels without granting any coverage', async () => {
    const { service, confirmed } = build({ payment: pending })
    const result = await service.decide(5, SubscriptionPaymentStatus.CANCELLED)

    expect(result.status).toBe(SubscriptionPaymentStatus.CANCELLED)
    expect(confirmed).toHaveLength(0)
  })

  it('refuses a request that was already decided', async () => {
    const { service } = build({
      payment: { ...pending, status: SubscriptionPaymentStatus.PAID },
    })
    await expect(service.decide(5, SubscriptionPaymentStatus.PAID)).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('refuses a request that does not exist', async () => {
    const { service } = build({ payment: null })
    await expect(service.decide(404, SubscriptionPaymentStatus.PAID)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
