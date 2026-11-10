import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeAvailability, TRACKING_CONSENT_VERSION } from '../src/live-dispatch/fleet/domain/availability'
import { classifyBatch, haversineMeters, suspiciousJump, trackingPolicy, validateFix } from '../src/live-dispatch/fleet/domain/gps'
import {
  allowedDriverActions,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  planTransition,
  type OrderStateSnapshot,
} from '../src/live-dispatch/orders/domain/order-state'
import { capabilityMismatches, unconfirmedRequirements } from '../src/live-dispatch/orders/domain/requirements'
import { DispatchError } from '../src/live-dispatch/platform/errors'
import { DEFAULT_DISPATCH_SETTINGS, resolveSettings, validateSetting } from '../src/live-dispatch/platform/settings'
import { isoSecondsAgo, settings, YEREVAN } from './helpers'

const NOW = new Date('2026-11-08T10:00:00.000Z')

describe('GPS validation', () => {
  const fix = (over: Record<string, unknown> = {}) => ({
    seq: 1,
    latitude: YEREVAN.latitude,
    longitude: YEREVAN.longitude,
    accuracyM: 12,
    measuredAt: isoSecondsAgo(5, NOW),
    ...over,
  })

  it('accepts a normal fix and rounds to 6 decimals', () => {
    const result = validateFix(fix({ latitude: 40.17721234567 }) as never, NOW, settings())
    assert.ok(result.ok)
    assert.equal(result.ok && result.fix.latitude, 40.177212)
  })

  for (const [name, over, reason] of [
    ['NaN latitude', { latitude: Number.NaN }, 'NOT_A_NUMBER'],
    ['Infinity longitude', { longitude: Number.POSITIVE_INFINITY }, 'NOT_A_NUMBER'],
    ['latitude 91', { latitude: 91 }, 'OUT_OF_RANGE'],
    ['Paris', { latitude: 48.85, longitude: 2.35 }, 'OUTSIDE_SERVICE_AREA'],
    ['swapped pair', { latitude: 44.5126, longitude: 40.1772 }, 'OUTSIDE_SERVICE_AREA'],
    ['negative accuracy', { accuracyM: -1 }, 'BAD_ACCURACY'],
    ['accuracy 5 km', { accuracyM: 5000 }, 'ACCURACY_TOO_LOW'],
    ['negative seq', { seq: -1 }, 'BAD_SEQUENCE'],
    ['fractional seq', { seq: 1.5 }, 'BAD_SEQUENCE'],
    ['garbage time', { measuredAt: 'yesterday' }, 'BAD_TIMESTAMP'],
    ['2 minutes in the future', { measuredAt: new Date(NOW.getTime() + 120_000).toISOString() }, 'FROM_THE_FUTURE'],
    ['3 days old', { measuredAt: isoSecondsAgo(3 * 86400, NOW) }, 'TOO_OLD'],
  ] as const) {
    it(`rejects ${name}`, () => {
      const result = validateFix(fix(over) as never, NOW, settings())
      assert.deepEqual(result, { ok: false, reason })
    })
  }

  it('clamps a slightly-future device clock to the receive time (never fresher than possible)', () => {
    const result = validateFix(fix({ measuredAt: new Date(NOW.getTime() + 10_000).toISOString() }) as never, NOW, settings())
    assert.ok(result.ok && result.fix.measuredAt.getTime() === NOW.getTime())
  })

  it('a buffered batch: only the newest FRESH fix may become current, old ones are history', () => {
    const batch = classifyBatch(
      [fix({ seq: 3, measuredAt: isoSecondsAgo(400, NOW) }), fix({ seq: 1, measuredAt: isoSecondsAgo(900, NOW) }), fix({ seq: 7, measuredAt: isoSecondsAgo(10, NOW) })] as never,
      NOW,
      settings(),
    )
    assert.deepEqual(batch.accepted.map((f) => f.seq), [1, 3, 7])
    assert.equal(batch.currentCandidate?.seq, 7)
    assert.deepEqual(batch.accepted.map((f) => f.late), [true, true, false])
  })

  it('an offline buffer flushed late yields NO current candidate', () => {
    const batch = classifyBatch([fix({ seq: 1, measuredAt: isoSecondsAgo(600, NOW) }), fix({ seq: 2, measuredAt: isoSecondsAgo(300, NOW) })] as never, NOW, settings())
    assert.equal(batch.currentCandidate, null)
    assert.equal(batch.accepted.length, 2)
  })

  it('duplicate seq inside one batch is rejected, not double-counted', () => {
    const batch = classifyBatch([fix({ seq: 4 }), fix({ seq: 4 })] as never, NOW, settings())
    assert.equal(batch.accepted.length, 1)
    assert.deepEqual(batch.rejected, [{ seq: 4, reason: 'DUPLICATE_IN_BATCH' }])
  })

  it('haversine: ~1.11 km per 0.01° latitude', () => {
    const d = haversineMeters(40, 44, 40.01, 44)
    assert.ok(Math.abs(d - 1112) < 3, String(d))
  })

  it('suspicious jump: 30 km in 10 s is flagged, 300 m with ±200 m accuracy is not', () => {
    const previous = { latitude: 40.1772, longitude: 44.5126, accuracyM: 10, measuredAt: new Date(NOW.getTime() - 10_000) }
    const far = validateFix(fix({ latitude: 40.45 }) as never, NOW, settings())
    assert.ok(far.ok)
    assert.match(String(suspiciousJump(previous, far.ok ? far.fix : (null as never), 70)), /implied speed/)
    const near = validateFix(fix({ latitude: 40.1799, accuracyM: 200 }) as never, NOW, settings())
    assert.equal(suspiciousJump({ ...previous, accuracyM: 200 }, near.ok ? near.fix : (null as never), 70), null)
  })

  it('tracking policy: active order is the most frequent, offline is off', () => {
    assert.equal(trackingPolicy({ wantsOnline: false, hasActiveOrder: false, lastSpeedMps: null }).mode, 'OFF')
    // offline by choice does NOT stop tracking an active order
    assert.equal(trackingPolicy({ wantsOnline: false, hasActiveOrder: true, lastSpeedMps: null }).mode, 'ACTIVE_ORDER')
    const active = trackingPolicy({ wantsOnline: true, hasActiveOrder: true, lastSpeedMps: 10 })
    const moving = trackingPolicy({ wantsOnline: true, hasActiveOrder: false, lastSpeedMps: 10 })
    const still = trackingPolicy({ wantsOnline: true, hasActiveOrder: false, lastSpeedMps: 0 })
    assert.ok(active.locationIntervalSeconds! <= 15 && active.locationIntervalSeconds! >= 10)
    assert.ok(moving.locationIntervalSeconds! >= 30 && moving.locationIntervalSeconds! <= 60)
    assert.ok(still.locationIntervalSeconds! > moving.locationIntervalSeconds!)
    // every interval plus its jitter stays inside the default GPS freshness window,
    // and inside one minute (product requirement)
    for (const policy of [active, moving, still]) {
      assert.ok(policy.locationIntervalSeconds! + policy.jitterSeconds < settings().gpsMaxAgeSeconds)
      assert.ok(policy.locationIntervalSeconds! + policy.jitterSeconds <= 60)
      // a distance gate starves a driver who is standing still of fixes
      assert.equal(policy.distanceFilterMeters, 0)
    }
  })
})

describe('availability', () => {
  const base = {
    isActive: true,
    dispatchSuspendedAt: null,
    wantsOnline: true,
    lastHeartbeatAt: new Date(NOW.getTime() - 20_000),
    trackingConsentVersion: TRACKING_CONSENT_VERSION,
    location: { measuredAt: new Date(NOW.getTime() - 30_000), accuracyM: 20, suspicious: false },
    externalBusy: false,
    hasPendingOffer: false,
    hasActiveAssignment: false,
  }

  it('eligible when every fact is green', () => {
    const a = computeAvailability(base, NOW, settings())
    assert.equal(a.eligible, true)
    assert.deepEqual(a.reasons, [])
  })

  it('a fresh heartbeat does NOT make an old GPS fix fresh', () => {
    const a = computeAvailability(
      { ...base, lastHeartbeatAt: new Date(NOW.getTime() - 1000), location: { ...base.location, measuredAt: new Date(NOW.getTime() - 121_000) } },
      NOW,
      settings(),
    )
    assert.equal(a.connection, 'FRESH')
    assert.equal(a.gps, 'STALE')
    assert.deepEqual(a.reasons, ['GPS_STALE'])
  })

  it('each fact independently blocks, and all reasons are reported', () => {
    const a = computeAvailability(
      { ...base, isActive: false, wantsOnline: false, lastHeartbeatAt: null, location: null, hasPendingOffer: true, hasActiveAssignment: true, externalBusy: true, trackingConsentVersion: null },
      NOW,
      settings(),
    )
    assert.deepEqual(a.reasons, ['INACTIVE', 'NO_TRACKING_CONSENT', 'OFFLINE_BY_CHOICE', 'CONNECTION_STALE', 'GPS_MISSING', 'ON_ORDER', 'RESERVED', 'EXTERNAL_BUSY'])
    assert.equal(a.occupancy, 'ON_ORDER')
  })

  it('inaccurate and suspicious fixes block dispatch', () => {
    assert.equal(computeAvailability({ ...base, location: { ...base.location, accuracyM: 500 } }, NOW, settings()).gps, 'INACCURATE')
    assert.equal(computeAvailability({ ...base, location: { ...base.location, suspicious: true } }, NOW, settings()).gps, 'SUSPICIOUS')
  })

  it('freshness boundary is inclusive at exactly gpsMaxAgeSeconds', () => {
    const at = (seconds: number) =>
      computeAvailability({ ...base, location: { ...base.location, measuredAt: new Date(NOW.getTime() - seconds * 1000) } }, NOW, settings()).gps
    assert.equal(at(120), 'FRESH')
    assert.equal(at(120.001), 'STALE')
  })
})

describe('requirements', () => {
  const order = { vehicleWeightKg: 1500, wheelsRoll: true, steeringLocked: false, gearboxLocked: false, needsManipulator: false, overridden: false }
  const flatbed = { vehicleType: 'flatbed', capacityTons: 3.5, maxLoadTons: null, manipulator: false, wheelSkates: false }

  it('unknown is never "fits": every null is reported until overridden', () => {
    assert.deepEqual(
      unconfirmedRequirements({ ...order, vehicleWeightKg: null, wheelsRoll: null, needsManipulator: null }),
      ['vehicleWeightKg', 'wheelsRoll', 'needsManipulator'],
    )
    assert.deepEqual(unconfirmedRequirements({ ...order, vehicleWeightKg: null, overridden: true }), [])
  })

  it('capacity, crane and locked-wheel equipment', () => {
    assert.deepEqual(capabilityMismatches(order, flatbed), [])
    assert.deepEqual(capabilityMismatches({ ...order, vehicleWeightKg: 4000 }, flatbed), ['CAPACITY'])
    assert.deepEqual(capabilityMismatches({ ...order, needsManipulator: true }, flatbed), ['MANIPULATOR'])
    assert.deepEqual(capabilityMismatches({ ...order, gearboxLocked: true }, flatbed), ['LOCKED_WHEEL_EQUIPMENT'])
    assert.deepEqual(capabilityMismatches({ ...order, gearboxLocked: true }, { ...flatbed, wheelSkates: true }), [])
    // the crane checkbox on a flatbed counts as a crane (derivesManipulator)
    assert.deepEqual(capabilityMismatches({ ...order, needsManipulator: true, wheelsRoll: false }, { ...flatbed, manipulator: true }), [])
  })

  it('wheel skates asked for explicitly: only a truck that HAS them (a crane does not substitute)', () => {
    const skates = { ...order, needsWheelSkates: true }
    assert.deepEqual(capabilityMismatches(skates, flatbed), ['WHEEL_SKATES'])
    assert.deepEqual(capabilityMismatches(skates, { ...flatbed, wheelSkates: true }), [])
    assert.deepEqual(capabilityMismatches(skates, { ...flatbed, manipulator: true }), ['WHEEL_SKATES'])
    // not asked / answered no: no restriction
    assert.deepEqual(capabilityMismatches({ ...order, needsWheelSkates: false }, flatbed), [])
  })

  it('specialist types are not sent to ordinary jobs', () => {
    assert.deepEqual(capabilityMismatches(order, { ...flatbed, vehicleType: 'heavy-duty', capacityTons: 20 }), ['SPECIALIST_TYPE'])
    assert.deepEqual(capabilityMismatches({ ...order, vehicleWeightKg: 9000 }, { ...flatbed, vehicleType: 'heavy-duty', capacityTons: 20 }), [])
    assert.deepEqual(capabilityMismatches(order, { ...flatbed, vehicleType: 'manipulator' }), ['SPECIALIST_TYPE'])
  })
})

describe('order state machine', () => {
  const snap = (over: Partial<OrderStateSnapshot> = {}): OrderStateSnapshot => ({
    status: 'DRAFT',
    attentionKind: null,
    statusBeforeAttention: null,
    hasActiveAssignment: false,
    pricingMode: 'FIXED',
    priceConfirmed: false,
    ...over,
  })

  it('every rule references real statuses and at least one actor', () => {
    for (const rule of ORDER_TRANSITIONS) {
      assert.ok(rule.actors.length > 0, rule.action)
      for (const from of rule.from) assert.ok(ORDER_STATUSES.includes(from), `${rule.action} from ${from}`)
    }
  })

  it('nothing ever leaves a terminal status', () => {
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      for (const rule of ORDER_TRANSITIONS) {
        for (const actor of ['ADMIN', 'DRIVER', 'SYSTEM'] as const) {
          assert.throws(() => planTransition(rule.action, snap({ status, hasActiveAssignment: true }), actor), DispatchError)
        }
      }
    }
  })

  it('accept goes to ASSIGNED for FIXED and PRICE_CONFIRMATION_PENDING for negotiation', () => {
    assert.equal(planTransition('OFFER_ACCEPTED', snap({ status: 'SEARCHING' }), 'DRIVER').to, 'ASSIGNED')
    assert.equal(
      planTransition('OFFER_ACCEPTED', snap({ status: 'SEARCHING', pricingMode: 'NEGOTIATION_REQUIRED' }), 'DRIVER').to,
      'PRICE_CONFIRMATION_PENDING',
    )
  })

  it('transport cannot start before a negotiated price is confirmed', () => {
    const order = snap({ status: 'ARRIVED_AT_PICKUP', pricingMode: 'NEGOTIATION_REQUIRED', hasActiveAssignment: true })
    assert.throws(() => planTransition('START_TRANSPORT', order, 'DRIVER'), (e: DispatchError) => e.code === 'PRICE_NOT_CONFIRMED')
    assert.equal(planTransition('START_TRANSPORT', { ...order, priceConfirmed: true }, 'DRIVER').to, 'TRANSPORTING')
    // but the driver may head out and arrive while the price is being agreed
    assert.deepEqual(
      allowedDriverActions({ ...order, status: 'PRICE_CONFIRMATION_PENDING' }),
      ['EN_ROUTE', 'ARRIVED'],
    )
  })

  it('a driver cancel request KEEPS the assignment and blocks progress until an operator acts', () => {
    const active = snap({ status: 'ASSIGNED', hasActiveAssignment: true })
    const planned = planTransition('DRIVER_CANCEL_REQUEST', active, 'DRIVER')
    assert.deepEqual(planned, { to: 'NEEDS_ATTENTION', statusBeforeAttention: 'ASSIGNED', attentionKind: 'DRIVER_CANCEL_REQUEST' })
    const attention = snap({ status: 'NEEDS_ATTENTION', attentionKind: 'DRIVER_CANCEL_REQUEST', statusBeforeAttention: 'ASSIGNED', hasActiveAssignment: true })
    assert.deepEqual(allowedDriverActions(attention), [])
    // restarting the search is impossible while a driver is attached…
    assert.throws(() => planTransition('START_DISPATCH', attention, 'ADMIN'), DispatchError)
    // …the operator must release first (which can restart the search in one step)
    assert.equal(planTransition('RELEASE_ASSIGNMENT', attention, 'ADMIN', { restartSearch: true }).to, 'SEARCHING')
    assert.equal(planTransition('RESUME_FROM_ATTENTION', attention, 'ADMIN').to, 'ASSIGNED')
  })

  it('a driver cancel for any reason but «customer declined» goes straight back to search', () => {
    const accepted = snap({ status: 'ASSIGNED', hasActiveAssignment: true })
    assert.deepEqual(planTransition('DRIVER_CANCEL_REQUEST', accepted, 'DRIVER', { redispatch: true }), {
      to: 'SEARCHING',
      statusBeforeAttention: null,
      attentionKind: null,
    })
    // still only before setting off
    assert.throws(
      () => planTransition('DRIVER_CANCEL_REQUEST', snap({ status: 'EN_ROUTE_TO_PICKUP', hasActiveAssignment: true }), 'DRIVER', { redispatch: true }),
      DispatchError,
    )
  })

  it('a driver may ask to cancel only before setting off; afterwards only a PROBLEM report', () => {
    for (const status of ['ASSIGNED', 'PRICE_CONFIRMATION_PENDING'] as const) {
      assert.equal(planTransition('DRIVER_CANCEL_REQUEST', snap({ status, hasActiveAssignment: true }), 'DRIVER').to, 'NEEDS_ATTENTION')
    }
    for (const status of ['EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'TRANSPORTING'] as const) {
      assert.throws(() => planTransition('DRIVER_CANCEL_REQUEST', snap({ status, hasActiveAssignment: true }), 'DRIVER'), DispatchError)
    }
  })

  it('the driver records a negotiated price himself, which unblocks transport', () => {
    const arrived = snap({ status: 'ARRIVED_AT_PICKUP', pricingMode: 'NEGOTIATION_REQUIRED', hasActiveAssignment: true })
    assert.equal(planTransition('CONFIRM_PRICE', arrived, 'DRIVER').to, 'ARRIVED_AT_PICKUP')
    assert.equal(planTransition('CONFIRM_PRICE', { ...arrived, status: 'PRICE_CONFIRMATION_PENDING' }, 'DRIVER').to, 'ASSIGNED')
    // nothing to record for a fixed price, or twice
    assert.throws(() => planTransition('CONFIRM_PRICE', { ...arrived, pricingMode: 'FIXED' }, 'DRIVER'), DispatchError)
    assert.throws(() => planTransition('CONFIRM_PRICE', { ...arrived, priceConfirmed: true }, 'DRIVER'), DispatchError)
  })

  it('a failed search can be restarted; drivers cannot act on admin-only transitions', () => {
    const failed = snap({ status: 'NEEDS_ATTENTION', attentionKind: 'SEARCH_EXHAUSTED' })
    assert.equal(planTransition('START_DISPATCH', failed, 'ADMIN').to, 'SEARCHING')
    assert.throws(() => planTransition('START_DISPATCH', snap(), 'DRIVER'), DispatchError)
    assert.throws(() => planTransition('CANCEL', snap({ status: 'SEARCHING' }), 'DRIVER'), DispatchError)
    assert.throws(() => planTransition('SEARCH_FAILED', snap({ status: 'SEARCHING' }), 'ADMIN'), DispatchError)
  })

  it('completion is a status, never a payment', () => {
    const rule = ORDER_TRANSITIONS.find((r) => r.action === 'COMPLETE')!
    assert.match(rule.preconditions, /does NOT change payment/)
  })
})

describe('settings', () => {
  it('rejects out-of-range and non-increasing radii', () => {
    assert.match(String(validateSetting('offerTimeoutSeconds', 5)), /10–300/)
    assert.match(String(validateSetting('yerevanRadiiMeters', [5000, 4000])), /increasing/)
    assert.match(String(validateSetting('nope', 1)), /unknown/)
    assert.equal(validateSetting('gpsMaxAgeSeconds', 180), null)
  })

  it('a bad stored row falls back to the default instead of breaking dispatch', () => {
    const invalid: string[] = []
    const resolved = resolveSettings([{ key: 'offerTimeoutSeconds', value: 'thirty' }, { key: 'gpsMaxAgeSeconds', value: 180 }], (key) => invalid.push(key))
    assert.equal(resolved.offerTimeoutSeconds, DEFAULT_DISPATCH_SETTINGS.offerTimeoutSeconds)
    assert.equal(resolved.gpsMaxAgeSeconds, 180)
    assert.deepEqual(invalid, ['offerTimeoutSeconds'])
  })
})
