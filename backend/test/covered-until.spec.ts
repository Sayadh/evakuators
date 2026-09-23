import { describe, expect, it } from 'vitest'
import {
  derivePaymentStatus,
  isLockedOut,
  PAYMENT_DUE_SOON_WITHIN_DAYS,
  resolveCoveredUntil,
} from '../src/subscriptions/subscription-status'

/**
 * `resolveCoveredUntil` — the join between money (`paidThrough`) and an
 * admin's deadline (`TowTruck.paymentDueAt`).
 *
 * The properties worth pinning are the two that a `??` would get wrong and a
 * reader would not notice, plus the end-to-end shape of what «Դարձնել
 * վճարովի» actually does to a driver.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-23T10:00:00.000Z')
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY)

describe('resolveCoveredUntil', () => {
  it('is null when a driver has never paid and nobody has billed them', () => {
    expect(resolveCoveredUntil(null, null)).toBeNull()
  })

  it('is the deadline for a driver who has never paid', () => {
    expect(resolveCoveredUntil(null, at(5))).toEqual(at(5))
  })

  it('is the payment for a driver nobody has set a deadline for', () => {
    expect(resolveCoveredUntil(at(20), null)).toEqual(at(20))
  })

  it(
    'takes the deadline over coverage that already lapsed — the case a `??` breaks',
    () => {
      // `paidThrough ?? paymentDueAt` returns the August date here, because it
      // is not null, and leaves the driver locked out despite the deadline an
      // admin just gave them. That is the whole reason this is a MAX.
      expect(resolveCoveredUntil(at(-40), at(5))).toEqual(at(5))
    },
  )

  it('ignores a stale deadline sitting behind live paid coverage', () => {
    // Which is why nothing has to clear `paymentDueAt` when a driver pays.
    expect(resolveCoveredUntil(at(30), at(5))).toEqual(at(30))
  })

  it('prefers the payment when the two are the same instant', () => {
    const same = at(5)
    expect(resolveCoveredUntil(same, new Date(same.getTime()))).toEqual(same)
  })
})

describe('«Դարձնել վճարովի», end to end through the status rule', () => {
  /** What AdminSubscriptionsService.setPaymentDue writes */
  const deadline = new Date(NOW.getTime() + PAYMENT_DUE_SOON_WITHIN_DAYS * DAY)

  it('leaves a never-billed driver alone: unpaid, and never locked', () => {
    const status = derivePaymentStatus(resolveCoveredUntil(null, null), NOW)
    expect(status).toBe('unpaid')
    expect(isLockedOut(status)).toBe(false)
  })

  it('puts the driver into due-soon on the press, not into paid', () => {
    // The press and the warning are the same constant, so there is no window
    // in which the driver is told their subscription is active.
    const status = derivePaymentStatus(resolveCoveredUntil(null, deadline), NOW)
    expect(status).toBe('due-soon')
    expect(isLockedOut(status)).toBe(false)
  })

  it('holds them in due-soon for every day of the grace', () => {
    for (let day = 0; day < PAYMENT_DUE_SOON_WITHIN_DAYS; day += 1) {
      const onThatDay = new Date(NOW.getTime() + day * DAY)
      expect(derivePaymentStatus(resolveCoveredUntil(null, deadline), onThatDay)).toBe('due-soon')
    }
  })

  it('locks them out once the deadline passes', () => {
    const afterwards = new Date(deadline.getTime() + 1)
    const status = derivePaymentStatus(resolveCoveredUntil(null, deadline), afterwards)
    expect(status).toBe('overdue')
    expect(isLockedOut(status)).toBe(true)
  })

  it('hands the driver back to the ordinary cycle once they pay', () => {
    // A real month bought on the deadline day. Coverage is now the payment's,
    // and the deadline behind it stops mattering without being cleared.
    const paidThrough = new Date(deadline.getTime() + 30 * DAY)
    const status = derivePaymentStatus(resolveCoveredUntil(paidThrough, deadline), NOW)
    expect(status).toBe('paid')
  })
})
