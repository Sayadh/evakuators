import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import {
  sortPaymentsByUrgency,
  toAdminPaymentSummary,
} from '../src/admin/admin-payment.mapper'
import type { AdminPaymentSummary } from '../src/admin/admin-payment.mapper'
import {
  derivePaymentStatus,
  PAYMENT_DUE_SOON_WITHIN_DAYS,
} from '../src/subscriptions/subscription-status'
import type { PaymentStatus } from '../src/subscriptions/subscription-status'

/**
 * The `/admin/payments` status, now a function of WHEN THE DRIVER'S PERIOD
 * ENDS rather than how many days ago someone ticked a box.
 *
 * The boundaries are pinned exactly, since an off-by-one here is the
 * difference between an admin trusting the "due soon" warning and a driver
 * being called overdue a day early. The case that motivated the rewrite —
 * a 4-month plan — gets its own test at the bottom.
 */

const NOW = new Date('2026-08-29T12:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const inDays = (days: number): Date => new Date(NOW.getTime() + days * DAY_MS)

describe('derivePaymentStatus', () => {
  it('is "unpaid" when no payment was ever confirmed', () => {
    expect(derivePaymentStatus(null, NOW)).toBe('unpaid')
  })

  it('is "paid" while the period still has room to run', () => {
    expect(derivePaymentStatus(inDays(30), NOW)).toBe('paid')
    expect(derivePaymentStatus(inDays(PAYMENT_DUE_SOON_WITHIN_DAYS + 1), NOW)).toBe('paid')
  })

  it('turns "due-soon" exactly at the configured warning window, not a day before', () => {
    expect(derivePaymentStatus(inDays(PAYMENT_DUE_SOON_WITHIN_DAYS), NOW)).toBe('due-soon')
    expect(derivePaymentStatus(inDays(1), NOW)).toBe('due-soon')
  })

  it('turns "overdue" the moment the period ends, not a day later', () => {
    expect(derivePaymentStatus(NOW, NOW)).toBe('overdue')
    expect(derivePaymentStatus(inDays(-1), NOW)).toBe('overdue')
  })

  it('stays "overdue" arbitrarily far in the past — there is no fifth state', () => {
    expect(derivePaymentStatus(inDays(-365), NOW)).toBe('overdue')
  })

  it('reads a 4-month subscriber as paid a month in — the bug this replaced', () => {
    // The old rule counted days since the payment and called anything past 30
    // "overdue", so a driver who had paid for four months was chased for money
    // on day 31. Their period is what decides now.
    const boughtFourMonths = new Date('2026-12-01T12:00:00Z')
    const oneMonthIn = new Date('2026-09-29T12:00:00Z')
    expect(derivePaymentStatus(boughtFourMonths, oneMonthIn)).toBe('paid')
  })
})

describe('toAdminPaymentSummary', () => {
  const truck = {
    id: 4,
    driverName: 'Արամ Պետրոսյան',
    companyName: null,
    phone: '+37491000001',
    isActive: true,
  }

  it('projects coverage into the row the admin page reads', () => {
    const summary = toAdminPaymentSummary(truck, {
      paidUntil: inDays(20),
      lastPaidAt: inDays(-10),
      pendingCount: 0,
    })

    expect(summary).toMatchObject({
      id: 4,
      driverName: 'Արամ Պետրոսյան',
      phone: '+37491000001',
      status: 'paid',
      pendingCount: 0,
      isActive: true,
    })
    expect(summary.paidUntil).toBe(inDays(20).toISOString())
    expect(summary.companyName).toBeUndefined()
  })

  it('is "unpaid" — not "paid" — for a driver whose only request is still pending', () => {
    // The property that keeps the page honest: a request is not a payment.
    const summary = toAdminPaymentSummary(truck, {
      paidUntil: null,
      lastPaidAt: null,
      pendingCount: 1,
    })
    expect(summary.status).toBe('unpaid')
    expect(summary.pendingCount).toBe(1)
  })
})

describe('sortPaymentsByUrgency', () => {
  function row(driverName: string, status: PaymentStatus): AdminPaymentSummary {
    return {
      id: 1,
      driverName,
      phone: '+37491000001',
      pendingCount: 0,
      status,
      isActive: true,
    }
  }

  it('puts overdue first, then due-soon, then everyone else', () => {
    const sorted = sortPaymentsByUrgency([
      row('paid', 'paid'),
      row('overdue', 'overdue'),
      row('unpaid', 'unpaid'),
      row('due-soon', 'due-soon'),
    ])
    expect(sorted.map((r) => r.driverName)).toEqual(['overdue', 'due-soon', 'paid', 'unpaid'])
  })

  it('keeps the query’s alphabetical order inside each group (stable sort)', () => {
    const sorted = sortPaymentsByUrgency([
      row('Ա', 'overdue'),
      row('Բ', 'overdue'),
      row('Գ', 'paid'),
    ])
    expect(sorted.map((r) => r.driverName)).toEqual(['Ա', 'Բ', 'Գ'])
  })
})
