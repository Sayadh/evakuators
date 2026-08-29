import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import {
  derivePaymentStatus,
  PAYMENT_DUE_SOON_AFTER_DAYS,
  PAYMENT_OVERDUE_AFTER_DAYS,
  sortPaymentsByUrgency,
  toAdminPaymentSummary,
} from '../src/admin/admin-payment.mapper'
import type { AdminPaymentSummary, PaymentStatus } from '../src/admin/admin-payment.mapper'

/**
 * A monthly-recurring flag with no reset job: the state is entirely a
 * function of "how long ago was `lastPaymentAt`", recomputed on every read.
 * These pin the day-count boundaries exactly, since an off-by-one here is
 * the difference between an admin trusting the "due soon" warning and a
 * driver being called overdue a day early.
 */

const NOW = new Date('2026-08-29T12:00:00Z')
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

describe('derivePaymentStatus', () => {
  it('is "unpaid" for a driver never marked at all', () => {
    expect(derivePaymentStatus(null, NOW)).toBe('unpaid')
  })

  it('is "paid" right after being marked, and for the first 24 days', () => {
    expect(derivePaymentStatus(daysAgo(0), NOW)).toBe('paid')
    expect(derivePaymentStatus(daysAgo(24), NOW)).toBe('paid')
  })

  it('turns "due-soon" exactly at the configured threshold, not a day before', () => {
    expect(derivePaymentStatus(daysAgo(PAYMENT_DUE_SOON_AFTER_DAYS - 1), NOW)).toBe('paid')
    expect(derivePaymentStatus(daysAgo(PAYMENT_DUE_SOON_AFTER_DAYS), NOW)).toBe('due-soon')
  })

  it('turns "overdue" exactly at the configured threshold, not a day before', () => {
    expect(derivePaymentStatus(daysAgo(PAYMENT_OVERDUE_AFTER_DAYS - 1), NOW)).toBe('due-soon')
    expect(derivePaymentStatus(daysAgo(PAYMENT_OVERDUE_AFTER_DAYS), NOW)).toBe('overdue')
  })

  it('stays "overdue" arbitrarily far in the past — there is no fifth state', () => {
    expect(derivePaymentStatus(daysAgo(365), NOW)).toBe('overdue')
  })
})

describe('toAdminPaymentSummary', () => {
  function truck(overrides: Partial<Parameters<typeof toAdminPaymentSummary>[0]> = {}) {
    return {
      id: 1,
      driverName: 'Վարորդ',
      companyName: null,
      phone: '+37491000001',
      lastPaymentAt: null,
      isActive: true,
      ...overrides,
    }
  }

  it('carries the driver identity fields through unchanged', () => {
    const summary = toAdminPaymentSummary(truck({ driverName: 'Արամ Առաքելյան', phone: '+37491000002' }))
    expect(summary.driverName).toBe('Արամ Առաքելյան')
    expect(summary.phone).toBe('+37491000002')
  })

  it('omits companyName when null rather than sending it as null', () => {
    expect(toAdminPaymentSummary(truck({ companyName: null })).companyName).toBeUndefined()
    expect(toAdminPaymentSummary(truck({ companyName: 'ՍՊԸ' })).companyName).toBe('ՍՊԸ')
  })

  it('omits lastPaymentAt when never paid, and serialises it to ISO when set', () => {
    expect(toAdminPaymentSummary(truck({ lastPaymentAt: null })).lastPaymentAt).toBeUndefined()
    const paidAt = new Date('2026-08-01T10:00:00Z')
    expect(toAdminPaymentSummary(truck({ lastPaymentAt: paidAt })).lastPaymentAt).toBe(paidAt.toISOString())
  })

  it('derives status from lastPaymentAt through the same function derivePaymentStatus exposes', () => {
    expect(toAdminPaymentSummary(truck({ lastPaymentAt: null })).status).toBe('unpaid')
  })

  it('carries isActive through unchanged — the "deactivate" button on an overdue row depends on it', () => {
    expect(toAdminPaymentSummary(truck({ isActive: true })).isActive).toBe(true)
    expect(toAdminPaymentSummary(truck({ isActive: false })).isActive).toBe(false)
  })
})

describe('sortPaymentsByUrgency', () => {
  function summary(id: number, status: PaymentStatus, driverName = `Driver ${id}`): AdminPaymentSummary {
    return { id, driverName, phone: '+37491000001', status, isActive: true }
  }

  it('puts every overdue row before every due-soon row, before everyone else', () => {
    const input = [
      summary(1, 'paid'),
      summary(2, 'overdue'),
      summary(3, 'unpaid'),
      summary(4, 'due-soon'),
    ]
    expect(sortPaymentsByUrgency(input).map((s) => s.id)).toEqual([2, 4, 1, 3])
  })

  it('treats paid and unpaid as the same group — neither outranks the other', () => {
    const input = [summary(1, 'paid', 'Բ'), summary(2, 'unpaid', 'Ա')]
    // Stable sort: equal urgency means the incoming (already alphabetical)
    // order survives untouched, not a status-based tiebreak.
    expect(sortPaymentsByUrgency(input).map((s) => s.id)).toEqual([1, 2])
  })

  it('is stable — preserves alphabetical order within each urgency group', () => {
    const input = [
      summary(1, 'overdue', 'Վ'),
      summary(2, 'overdue', 'Ա'),
      summary(3, 'overdue', 'Բ'),
    ]
    expect(sortPaymentsByUrgency(input).map((s) => s.id)).toEqual([1, 2, 3])
  })

  it('does not mutate the input array', () => {
    const input = [summary(1, 'paid'), summary(2, 'overdue')]
    const original = [...input]
    sortPaymentsByUrgency(input)
    expect(input).toEqual(original)
  })
})
