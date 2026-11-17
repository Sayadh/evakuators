import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PreOrder } from '../src/api/types'
import { pruneSeen, requirementKeys, sortPreOrders, unansweredCount, unseenCount, vehicleLine } from '../src/domain/preOrders'
import { emitPreOrderArrived, emitPreOrderTapped, isPreOrderPush, onPreOrderArrived, onPreOrderTapped } from '../src/push/preOrderEvents'

function pre(id: number, overrides: Partial<PreOrder> = {}): PreOrder {
  return {
    id,
    open: true,
    createdAt: `2026-11-17T10:0${id}:00Z`,
    pickup: { latitude: null, longitude: null, address: 'Վորտեքս', precision: null },
    destination: null,
    vehicle: { make: 'Toyota', model: null, weightKg: 1600 },
    requirements: { wheelsRoll: null, steeringLocked: null, gearboxLocked: null, needsManipulator: null, needsWheelSkates: null, wheelSkatesCount: null },
    comment: '',
    myBidAmd: null,
    distanceMeters: null,
    chosen: false,
    ...overrides,
  }
}

describe('pre-orders (2026-11-17)', () => {
  it('counts only open, unpriced ones', () => {
    assert.equal(unansweredCount([pre(1), pre(2, { myBidAmd: 9000 }), pre(3, { open: false })]), 1)
  })

  it('the tab number: open, unpriced and not yet seen; the stored seen set keeps only listed ids', () => {
    const items = [pre(1), pre(2), pre(3, { myBidAmd: 9000 }), pre(4, { open: false })]
    assert.equal(unseenCount(items, new Set()), 2)
    assert.equal(unseenCount(items, new Set([1])), 1)
    assert.deepEqual(pruneSeen(items, new Set([1, 99]), [2]), [1, 2])
  })

  it('unanswered first, then answered, then closed; newest first inside each', () => {
    const sorted = sortPreOrders([pre(1, { open: false, myBidAmd: 1 }), pre(2, { myBidAmd: 9000 }), pre(3), pre(4)])
    assert.deepEqual(sorted.map((p) => p.id), [4, 3, 2, 1])
  })

  it('requirement chips and vehicle line', () => {
    const p = pre(1, { requirements: { wheelsRoll: false, steeringLocked: true, gearboxLocked: null, needsManipulator: null, needsWheelSkates: true, wheelSkatesCount: 4 } })
    assert.deepEqual(requirementKeys(p), [{ key: 'wheelsLocked' }, { key: 'steeringLocked' }, { key: 'skates', count: 4 }])
    assert.equal(vehicleLine(p, 'կգ'), 'Toyota · 1600 կգ')
  })

  it('push data: only pre_order with a numeric id', () => {
    assert.equal(isPreOrderPush({ type: 'pre_order', preOrderId: '12' }), 12)
    assert.equal(isPreOrderPush({ type: 'offer', offerId: 'x' }), null)
    assert.equal(isPreOrderPush({ type: 'pre_order', preOrderId: 'x' }), null)
  })

  it('a tap before anyone listens is kept for the first listener; arrivals reach listeners', () => {
    const arrivals: number[] = []
    const offArrived = onPreOrderArrived((id) => arrivals.push(id))
    emitPreOrderTapped(5)
    const taps: number[] = []
    const off = onPreOrderTapped((id) => taps.push(id))
    assert.deepEqual(taps, [5])
    emitPreOrderTapped(6)
    emitPreOrderArrived(7)
    assert.deepEqual(taps, [5, 6])
    assert.deepEqual(arrivals, [5, 6, 7])
    off()
    offArrived()
  })
})
