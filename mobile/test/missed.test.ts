import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissedOffer } from '../src/api/types'
import { groupMissedByDay, hasDeliveryProblem, nextMissedCursor, pickupDistance, unseenCount } from '../src/domain/missed'

const offer = (offeredAt: string, patch: Partial<MissedOffer> = {}): MissedOffer => ({
  offerId: offeredAt,
  offeredAt,
  expiresAt: offeredAt,
  reason: 'NO_ANSWER',
  toPickup: { roadMeters: null, etaSeconds: null, straightLineMeters: null },
  outcome: 'TAKEN',
  order: { number: '1', pickupAddress: 'A', destinationAddress: null, vehicle: { make: null, model: null }, problemDescription: '', price: { mode: 'FIXED', amountAmd: null }, route: null },
  ...patch,
})

describe('missed offers', () => {
  const items = [offer('2026-11-12T08:00:00Z'), offer('2026-11-12T06:00:00Z'), offer('2026-11-11T19:30:00Z')]
  it('counts only what came after the list was last opened', () => {
    assert.equal(unseenCount(items, null), 3)
    assert.equal(unseenCount(items, Date.parse('2026-11-12T07:00:00Z')), 1)
    assert.equal(unseenCount(items, Date.parse('2026-11-12T09:00:00Z')), 0)
  })
  it('groups by the Yerevan day (23:30 Yerevan stays on its own day)', () => {
    const groups = groupMissedByDay(items)
    assert.deepEqual(groups.map((g) => [g.dayKey, g.items.length]), [['2026-11-12', 2], ['2026-11-11', 1]])
  })
  it('pages by the last offeredAt', () => {
    assert.equal(nextMissedCursor(items), '2026-11-11T19:30:00Z')
    assert.equal(nextMissedCursor([]), undefined)
  })
  it('road distance when known, else the straight line marked approximate', () => {
    assert.deepEqual(pickupDistance(offer('x', { toPickup: { roadMeters: 3200, etaSeconds: 400, straightLineMeters: null } })), { meters: 3200, approximate: false })
    assert.deepEqual(pickupDistance(offer('x', { toPickup: { roadMeters: null, etaSeconds: null, straightLineMeters: 2100 } })), { meters: 2100, approximate: true })
    assert.equal(pickupDistance(offer('x')), null)
  })
  it('flags offers that never reached the phone', () => {
    assert.equal(hasDeliveryProblem(items), false)
    assert.equal(hasDeliveryProblem([offer('x', { reason: 'NOT_DELIVERED' })]), true)
  })
})
