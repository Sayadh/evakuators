import 'reflect-metadata'
import type { ConfigService } from '@nestjs/config'
import { DeactivationReason } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { IdramService } from '../src/idram/idram.service'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import { ListingRestorationService } from '../src/subscriptions/listing-restoration.service'
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service'
import { paymentRestoresListing } from '../src/tow-trucks/tow-truck-reactivation'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'

/**
 * A confirmed payment putting a driver back on the site.
 *
 * The dashboard promises this in so many words — «Վճարումը կատարելուց հետո էջը
 * կվերականգնվի» — so the interesting cases are the ones where it must NOT
 * happen, and the one where it must not take the payment down with it.
 */

describe('paymentRestoresListing', () => {
  it('restores a driver taken off the site for non-payment', () => {
    expect(paymentRestoresListing({ isActive: false, deactivationReason: DeactivationReason.UNPAID })).toBe(true)
  })

  it('leaves a driver removed for another reason off the site', () => {
    // Otherwise every removal becomes a price: whatever they were removed for,
    // 3000 drams would undo it.
    expect(paymentRestoresListing({ isActive: false, deactivationReason: DeactivationReason.OTHER })).toBe(false)
  })

  it('leaves a driver with no recorded reason off the site', () => {
    // Deactivated before reasons existed. We cannot tell after the fact whether
    // they were banned or simply had not paid, and login already treats this
    // the same as OTHER.
    expect(paymentRestoresListing({ isActive: false, deactivationReason: null })).toBe(false)
  })

  it('does nothing to a driver who is already listed', () => {
    expect(paymentRestoresListing({ isActive: true, deactivationReason: null })).toBe(false)
  })
})

interface TruckRow {
  id: number
  phone: string
  slug: string
  isActive: boolean
  deactivationReason: DeactivationReason | null
}

function buildService(truck: TruckRow, conflict: TruckRow | null = null) {
  const setActive = vi.fn(async () => truck)

  const subscriptions = {
    findById: async () => ({
      id: 1,
      towTruckId: truck.id,
      planCode: 'ONE_MONTH',
      amount: 3000,
      currency: 'AMD',
      durationMonths: 1,
    }),
    findCoverage: async (ids: number[]) => {
      const map = new Map()
      for (const id of ids) map.set(id, { towTruckId: id, paidUntil: null, lastPaidAt: null, pendingCount: 0 })
      return map
    },
    confirm: async (
      _id: number,
      _towTruckId: number,
      _durationMonths: number,
      computePeriod: (paidUntil: Date | null, now: Date, months: number) => { start: Date; end: Date },
    ) => ({
      id: 1,
      towTruckId: truck.id,
      planCode: 'ONE_MONTH',
      planTitle: '1 ամսվա բաժանորդագրություն',
      amount: 3000,
      currency: 'AMD',
      durationMonths: 1,
      ...computePeriod(null, new Date(), 1),
      periodStart: computePeriod(null, new Date(), 1).start,
      periodEnd: computePeriod(null, new Date(), 1).end,
      status: 'PAID',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  } as unknown as SubscriptionsRepository

  const trucks = {
    findById: async () => truck,
    findByMainPhoneAnyStatus: async () => conflict,
    setActive,
  } as unknown as TowTrucksRepository

  const config = {
    getOrThrow: (key: string) =>
      key === 'subscriptions' ? { pilotTowTruckIds: 'all' } : { recAccount: 'x', secretKey: 'y' },
  } as unknown as ConfigService

  const service = new SubscriptionsService(
    subscriptions,
    trucks,
    // The real one, not a stub: reactivation is what this file is about, and it
    // moved behind this seam so the admin's cash-payment path could reuse it.
    new ListingRestorationService(trucks as never),
    { isConfigured: true, paymentForm: () => undefined } as unknown as IdramService,
    config,
  )
  return { service, setActive }
}

const deactivated = (reason: DeactivationReason | null): TruckRow => ({
  id: 7,
  phone: '+37491000001',
  slug: 'test-driver',
  isActive: false,
  deactivationReason: reason,
})

describe('confirmPayment restoring a listing', () => {
  it('puts a driver deactivated for non-payment back on the site', async () => {
    const { service, setActive } = buildService(deactivated(DeactivationReason.UNPAID))
    await service.confirmPayment(1)
    expect(setActive).toHaveBeenCalledWith(7, true, null)
  })

  it('leaves a driver deactivated for another reason alone', async () => {
    const { service, setActive } = buildService(deactivated(DeactivationReason.OTHER))
    await service.confirmPayment(1)
    expect(setActive).not.toHaveBeenCalled()
  })

  it('refuses to create two active trucks on one login phone', async () => {
    // The integrity rule AdminService enforces by hand: `phone` is the sole
    // login key and resolves with findFirst, so a second active row means one
    // of the two drivers silently cannot sign in. A payment is not a reason to
    // create that — an admin sorts the phones out first.
    const { service, setActive } = buildService(deactivated(DeactivationReason.UNPAID), {
      id: 9,
      phone: '+37491000001',
      slug: 'other-truck',
      isActive: true,
      deactivationReason: null,
    })
    const confirmed = await service.confirmPayment(1)

    expect(setActive).not.toHaveBeenCalled()
    // …and the payment still stands. The money moved; refusing to record it
    // would be the worse of the two failures, and Idram would retry the
    // callback forever.
    expect(confirmed).not.toBeNull()
  })

  it('never lets a reactivation failure undo a confirmed payment', async () => {
    // Idram reads the response body, not the status: an exception escaping
    // here would answer anything but OK and make it retry a payment we have
    // already recorded.
    const truck = deactivated(DeactivationReason.UNPAID)
    const { service } = buildService(truck)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(service as any).towTrucksRepository.setActive = async () => {
      throw new Error('database is on fire')
    }

    await expect(service.confirmPayment(1)).resolves.not.toBeNull()
  })
})

/**
 * The admin's cash-payment path does the same thing.
 *
 * This is the defect the shared service exists for: money arriving in cash and
 * money arriving through Idram leave the identical PAID row behind, and used to
 * leave the driver in two different states. The driver paid, the admin recorded
 * it, `derivePaymentStatus` said `paid` — and the truck was still off the site,
 * so the dashboard showed a locked screen to somebody who was fully paid up.
 */
describe('an admin recording a cash payment', () => {
  it('puts a driver deactivated for non-payment back on the site', async () => {
    const trucks = {
      findById: vi.fn(async () => ({
        id: 7,
        phone: '+37491000001',
        isActive: false,
        deactivationReason: DeactivationReason.UNPAID,
      })),
      findByMainPhoneAnyStatus: vi.fn(async () => null),
      setActive: vi.fn(async () => ({})),
    }

    await new ListingRestorationService(trucks as never).afterPayment(7)

    expect(trucks.setActive).toHaveBeenCalledWith(7, true, null)
  })

  it('leaves a driver removed for any other reason alone', async () => {
    // Letting them buy their way back would turn every removal into a price.
    const trucks = {
      findById: vi.fn(async () => ({
        id: 7,
        phone: '+37491000001',
        isActive: false,
        deactivationReason: DeactivationReason.OTHER,
      })),
      findByMainPhoneAnyStatus: vi.fn(async () => null),
      setActive: vi.fn(async () => ({})),
    }

    await new ListingRestorationService(trucks as never).afterPayment(7)

    expect(trucks.setActive).not.toHaveBeenCalled()
  })

  it('never throws, because the money is already recorded', async () => {
    // A failure here must not turn a confirmed payment into a failed request —
    // least of all one Idram would then retry.
    const trucks = {
      findById: vi.fn(async () => {
        throw new Error('db down')
      }),
    }

    await expect(
      new ListingRestorationService(trucks as never).afterPayment(7),
    ).resolves.toBeUndefined()
  })
})
