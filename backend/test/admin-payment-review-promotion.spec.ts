import { describe, expect, it, vi } from 'vitest'
import { SubscriptionPaymentStatus } from '@prisma/client'
import { AdminSubscriptionsService } from '../src/subscriptions/admin-subscriptions.service'
import {
  toAdminPaymentSummaryApi,
  toAdminPendingPaymentApi,
} from '../src/subscriptions/subscription.mapper'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'

/**
 * Placement payments in the admin's «Նոր վճարումներ» queue — the same list,
 * the same «Հաստատել», next to the subscriptions.
 */
const CREATED = new Date('2026-10-14T09:00:00.000Z')

function promotionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    towTruckId: 7,
    kind: 'PROMOTION',
    planCode: null,
    durationMonths: null,
    periodStart: null,
    periodEnd: null,
    promotionDays: 7,
    promotionScope: 'AREA',
    amount: 4500,
    currency: 'AMD',
    status: SubscriptionPaymentStatus.PAID,
    reviewedAt: null,
    provider: 'IDRAM',
    providerTransactionId: 't-1',
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  } as never
}

const DRIVER = { id: 7, driverName: 'Արամ', companyName: null, phone: '+37491000001' }

describe('a placement in the admin queue', () => {
  it('reads as what was bought, product and days included', () => {
    const row = toAdminPendingPaymentApi({ ...(promotionRow() as object), towTruck: DRIVER } as never)

    expect(row).toMatchObject({
      id: 41,
      kind: 'PROMOTION',
      planTitle: 'Առաջխաղացում · Ամբողջ սպասարկման տարածքում · 7 օր',
      amount: 4500,
      promotionDays: 7,
      promotionScope: 'AREA',
      driver: { id: 7, name: 'Արամ', phone: '+37491000001' },
    })
    // No subscription fields invented for a row that has none
    expect(row).not.toHaveProperty('periodStart')
    expect(row).not.toHaveProperty('durationMonths')
  })

  it('names the home product too', () => {
    expect(toAdminPaymentSummaryApi(promotionRow({ promotionScope: 'HOME', promotionDays: 1 })).planTitle).toBe(
      'Առաջխաղացում · Իմ քաղաքում վերևում · 1 օր',
    )
  })

  it('leaves the subscription shape as it was, plus `kind`', () => {
    const summary = toAdminPaymentSummaryApi({
      ...(promotionRow() as object),
      kind: 'SUBSCRIPTION',
      planCode: 'ONE_MONTH',
      durationMonths: 1,
      periodStart: CREATED,
      periodEnd: CREATED,
      promotionDays: null,
      promotionScope: null,
    } as never)

    expect(summary).toMatchObject({
      kind: 'SUBSCRIPTION',
      planCode: 'ONE_MONTH',
      durationMonths: 1,
      periodStart: CREATED.toISOString(),
    })
    expect(summary).not.toHaveProperty('promotionDays')
  })
})

describe('«Հաստատել» on a placement', () => {
  function build(row: unknown) {
    const markReviewed = vi.fn(async () => ({ ...(row as object), reviewedAt: new Date() }))
    const service = new AdminSubscriptionsService(
      { findById: vi.fn(async () => row), markReviewed } as unknown as SubscriptionsRepository,
      {} as unknown as TowTrucksRepository,
      { afterPayment: async () => {} } as never,
    )
    return { service, markReviewed }
  }

  it('ticks it off like a subscription', async () => {
    const { service, markReviewed } = build(promotionRow())
    await expect(service.review(41)).resolves.toMatchObject({ id: 41, kind: 'PROMOTION' })
    expect(markReviewed).toHaveBeenCalledWith(41)
  })

  it('still refuses one that was never paid', async () => {
    const { service, markReviewed } = build(promotionRow({ status: SubscriptionPaymentStatus.PENDING }))
    await expect(service.review(41)).rejects.toThrow()
    expect(markReviewed).not.toHaveBeenCalled()
  })
})
