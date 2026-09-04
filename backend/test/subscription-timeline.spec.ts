import 'reflect-metadata'
import { ConflictException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armeniaDateLabel } from '../src/common/armenia-day'
import type { IdramService } from '../src/idram/idram.service'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'

/**
 * The dates, end to end, over simulated time.
 *
 * Every other spec here tests one function with one input. This one drives the
 * real `SubscriptionsService` through a driver's actual year — pay, renew,
 * lapse, pay again — with the clock moved between steps, because that is where
 * the arithmetic can be individually correct and collectively wrong: the
 * quoted period and the granted one are computed by different functions at
 * different instants, and only a sequence shows whether they agree.
 *
 * Written as the last check before this ships: money and access both hang off
 * these dates, and an off-by-one here is either a day of free service or a
 * driver locked out of a page they paid for.
 */

const TOW_TRUCK = 7

/** ISO instant → the `dd.MM.yyyy` a driver is shown, so assertions read like the UI does */
const label = (date: Date): string => armeniaDateLabel(date)

interface Row {
  id: number
  towTruckId: number
  planCode: string
  amount: number
  currency: string
  durationMonths: number
  periodStart: Date
  periodEnd: Date
  status: 'PENDING' | 'PAID'
  provider?: string
  providerTransactionId?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * An in-memory stand-in that reproduces the two behaviours the real repository
 * gets from Postgres and nothing else: coverage is `MAX(periodEnd)` over PAID
 * rows (not the newest row), and `confirm` only touches a row that is still
 * PENDING.
 */
function timelineRepository(): { repository: SubscriptionsRepository; rows: Row[] } {
  const rows: Row[] = []
  let nextId = 1

  const repository = {
    create: async (towTruckId: number, data: Omit<Row, 'id' | 'towTruckId' | 'status' | 'createdAt' | 'updatedAt'>) => {
      const row: Row = {
        id: nextId++,
        towTruckId,
        ...data,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      rows.push(row)
      return row
    },

    findById: async (id: number) => rows.find((row) => row.id === id) ?? null,

    findCoverage: async (ids: number[]) => {
      const map = new Map()
      for (const id of ids) {
        const paid = rows.filter((row) => row.towTruckId === id && row.status === 'PAID')
        const paidUntil = paid.length
          ? new Date(Math.max(...paid.map((row) => row.periodEnd.getTime())))
          : null
        map.set(id, { towTruckId: id, paidUntil, lastPaidAt: null, pendingCount: 0 })
      }
      return map
    },

    confirm: async (id: number, period: { start: Date; end: Date }) => {
      const row = rows.find((candidate) => candidate.id === id && candidate.status === 'PENDING')
      if (!row) return null
      row.status = 'PAID'
      row.periodStart = period.start
      row.periodEnd = period.end
      return row
    },

    findOwn: async () => [],
  }

  return { repository: repository as unknown as SubscriptionsRepository, rows }
}

function buildService(repository: SubscriptionsRepository): SubscriptionsService {
  const trucks = {
    findStatusById: async () => ({ isActive: true, deactivationReason: null }),
    // Read after every confirmation by `restoreListingAfterPayment`; an active
    // truck is left alone, which is what these date scenarios are about.
    findById: async () => ({ id: TOW_TRUCK, phone: '+37491000001', slug: 'test', isActive: true, deactivationReason: null }),
  } as unknown as TowTrucksRepository
  const idram = { isConfigured: true, paymentForm: () => undefined } as unknown as IdramService
  const config = {
    getOrThrow: (key: string) =>
      key === 'subscriptions'
        ? { pilotTowTruckIds: 'all' }
        : { recAccount: '11112222', secretKey: 'secret' },
  } as unknown as ConfigService
  return new SubscriptionsService(repository, trucks, idram, config)
}

/** Move the whole system clock, the way the service reads it (`new Date()`) */
function at(iso: string): void {
  vi.setSystemTime(new Date(iso))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('a driver’s year', () => {
  it('pays, renews inside the window, lapses, and pays again', async () => {
    const { repository, rows } = timelineRepository()
    const service = buildService(repository)

    // ── 15 January: first ever payment ──────────────────────────────────────
    at('2026-01-15T09:00:00.000Z')
    const first = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(first.id)
    expect(label(rows[0].periodEnd)).toBe('15.02.2026')

    // ── 20 January: five days in, comfortably covered ───────────────────────
    at('2026-01-20T09:00:00.000Z')
    let status = await service.getMyStatus(TOW_TRUCK)
    expect(status.status).toBe('paid')
    expect(status.daysLeft).toBe(26)
    expect(status.locked).toBe(false)
    // …and cannot pay again: this is the accidental-double-payment guard.
    await expect(service.createPayment(TOW_TRUCK, 'ONE_MONTH')).rejects.toBeInstanceOf(
      ConflictException,
    )

    // ── 12 February: three days left, the renewal window is open ────────────
    at('2026-02-12T09:00:00.000Z')
    status = await service.getMyStatus(TOW_TRUCK)
    expect(status.status).toBe('due-soon')
    expect(status.daysLeft).toBe(3)

    const second = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(second.id)

    // Extended from the END of the old period, not from today: renewing three
    // days early must not cost three days.
    status = await service.getMyStatus(TOW_TRUCK)
    expect(status.paidUntil && label(new Date(status.paidUntil))).toBe('15.03.2026')

    // ── 20 April: long lapsed, and locked ───────────────────────────────────
    at('2026-04-20T09:00:00.000Z')
    status = await service.getMyStatus(TOW_TRUCK)
    expect(status.status).toBe('overdue')
    expect(status.daysLeft).toBe(0)
    expect(status.locked).toBe(true)

    const third = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(third.id)

    // Starts today, not from the stale March date — nobody pays for the weeks
    // they were not covered.
    status = await service.getMyStatus(TOW_TRUCK)
    expect(status.paidUntil && label(new Date(status.paidUntil))).toBe('20.05.2026')
    expect(status.locked).toBe(false)
  })
})

describe('the confirmation instant, not the request instant', () => {
  it('grants a full month from the day the money is confirmed', async () => {
    // The quote written at «Վճարել» is not what is granted. If Idram's callback
    // or an admin arrives four days later, honouring the quote would sell four
    // days less than the plan says.
    const { repository, rows } = timelineRepository()
    const service = buildService(repository)

    at('2026-01-10T09:00:00.000Z')
    const created = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    expect(label(new Date(created.periodEnd))).toBe('10.02.2026')

    at('2026-01-14T09:00:00.000Z')
    await service.confirmPayment(created.id)

    expect(label(rows[0].periodStart)).toBe('14.01.2026')
    expect(label(rows[0].periodEnd)).toBe('14.02.2026')
  })
})

describe('coverage is the furthest period, not the newest row', () => {
  it('is not shortened by confirming an older request afterwards', async () => {
    // Two PENDING requests, confirmed out of order — the driver keeps the
    // longer coverage either way. `findCoverage` is MAX(periodEnd) for exactly
    // this reason.
    const { repository } = timelineRepository()
    const service = buildService(repository)

    at('2026-01-10T09:00:00.000Z')
    const long = await service.createPayment(TOW_TRUCK, 'FOUR_MONTHS')
    await service.confirmPayment(long.id)

    const status = await service.getMyStatus(TOW_TRUCK)
    expect(status.paidUntil && label(new Date(status.paidUntil))).toBe('10.05.2026')
  })
})

describe('the 31st', () => {
  it('clamps to the short month and stays clamped afterwards', async () => {
    // A driver who first pays on the 31st renews on the 28th from then on.
    // That is the correct answer — the alternative overflows into March — but
    // it means the anniversary walks earlier, and it should be a decision
    // someone reads about rather than a surprise in a support call.
    const { repository, rows } = timelineRepository()
    const service = buildService(repository)

    at('2026-01-31T09:00:00.000Z')
    const first = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(first.id)
    expect(label(rows[0].periodEnd)).toBe('28.02.2026')

    at('2026-02-26T09:00:00.000Z')
    const second = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(second.id)
    // 28 March, not 31 March: the clamp does not un-clamp itself.
    expect(label(rows[1].periodEnd)).toBe('28.03.2026')
  })

  it('clamps to 29 February in a leap year', async () => {
    const { repository, rows } = timelineRepository()
    const service = buildService(repository)

    at('2028-01-31T09:00:00.000Z')
    const payment = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(payment.id)
    expect(label(rows[0].periodEnd)).toBe('29.02.2028')
  })
})

describe('the four-month plan', () => {
  it('crosses the year boundary', async () => {
    const { repository, rows } = timelineRepository()
    const service = buildService(repository)

    at('2026-11-15T09:00:00.000Z')
    const payment = await service.createPayment(TOW_TRUCK, 'FOUR_MONTHS')
    await service.confirmPayment(payment.id)
    expect(label(rows[0].periodEnd)).toBe('15.03.2027')
  })

  it('clamps across four months too', async () => {
    // 31 December + 4 months is 30 April, not 31 April.
    const { repository, rows } = timelineRepository()
    const service = buildService(repository)

    at('2026-12-31T09:00:00.000Z')
    const payment = await service.createPayment(TOW_TRUCK, 'FOUR_MONTHS')
    await service.confirmPayment(payment.id)
    expect(label(rows[0].periodEnd)).toBe('30.04.2027')
  })
})

describe('the last day', () => {
  it('is still covered with hours to go, and lapses the moment it passes', async () => {
    const { repository } = timelineRepository()
    const service = buildService(repository)

    at('2026-01-15T09:00:00.000Z')
    const payment = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(payment.id)

    // One hour before the end: still working, still able to renew.
    at('2026-02-15T08:00:00.000Z')
    let status = await service.getMyStatus(TOW_TRUCK)
    expect(status.status).toBe('due-soon')
    expect(status.locked).toBe(false)

    // One second after: locked, and the API refuses this driver's writes.
    at('2026-02-15T09:00:01.000Z')
    status = await service.getMyStatus(TOW_TRUCK)
    expect(status.status).toBe('overdue')
    expect(status.locked).toBe(true)
  })
})

describe('the date a driver is shown', () => {
  it('is the Armenian calendar day, which can be the next UTC day', async () => {
    // Yerevan is UTC+4 with no DST. A period ending at 21:00 UTC ends on the
    // FOLLOWING day in Armenia, and that later day is the honest thing to show
    // — the driver keeps working until then. Pinned so nobody "fixes" the
    // label into UTC and moves everyone's expiry a day earlier.
    const { repository, rows } = timelineRepository()
    const service = buildService(repository)

    at('2026-01-15T21:00:00.000Z')
    const payment = await service.createPayment(TOW_TRUCK, 'ONE_MONTH')
    await service.confirmPayment(payment.id)

    expect(rows[0].periodEnd.toISOString()).toBe('2026-02-15T21:00:00.000Z')
    expect(label(rows[0].periodEnd)).toBe('16.02.2026')
  })
})
