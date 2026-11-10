import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { measureClock, secondsLeft } from '../src/domain/countdown'
import { addFixes, nextChunk, removeSent, MAX_FIXES_PER_REQUEST, type Fix } from '../src/location/buffer'
import { fixIsDue, jittered, keepFix, needsRestart, DEFAULT_POLICY } from '../src/location/policy'
import { reconcile, type PendingAction } from '../src/state/pendingActions'

describe('countdown uses the server clock', () => {
  it('a phone 5 minutes slow still shows the true remaining time (minus a 1 s margin)', () => {
    const phoneNow = Date.parse('2026-11-08T10:00:00Z')
    const clock = measureClock('2026-11-08T10:05:00Z', phoneNow) // phone is 5 min behind
    assert.equal(secondsLeft('2026-11-08T10:05:30Z', clock, phoneNow), 29)
    assert.equal(secondsLeft('2026-11-08T10:05:30Z', clock, phoneNow + 31_000), 0)
  })
  it('garbage never yields a positive countdown', () => {
    assert.equal(secondsLeft('nope', { offsetMs: 0 }, Date.now()), 0)
  })
})

describe('offline buffer', () => {
  const fix = (seq: number): Fix => ({ seq, latitude: 40.18, longitude: 44.51, accuracyM: 10, measuredAt: new Date(seq * 1000).toISOString() })
  it('is bounded (oldest dropped), ordered, de-duplicated', () => {
    let buffer: Fix[] = []
    for (let i = 1; i <= 400; i++) buffer = addFixes(buffer, [fix(i)])
    buffer = addFixes(buffer, [fix(400), fix(399)])
    assert.equal(buffer.length, 300)
    assert.equal(buffer[0].seq, 101)
    assert.equal(buffer[299].seq, 400)
  })
  it('sends oldest first in API-sized chunks and forgets what was sent', () => {
    let buffer = Array.from({ length: 120 }, (_, i) => fix(i + 1))
    const chunk = nextChunk(buffer)
    assert.equal(chunk.length, MAX_FIXES_PER_REQUEST)
    assert.equal(chunk[0].seq, 1)
    buffer = removeSent(buffer, chunk)
    assert.equal(buffer.length, 70)
    assert.equal(buffer[0].seq, 51)
  })
})

describe('tracking policy', () => {
  it('jitter stays within ±jitter and never below 5 s', () => {
    for (let i = 0; i < 1000; i++) {
      const v = jittered(30, 8)
      assert.ok(v >= 22 && v <= 38, String(v))
    }
    assert.equal(jittered(3, 10, () => 0), 5)
  })
  it('restarts the OS task only when the cadence actually changes', () => {
    assert.equal(needsRestart(null, DEFAULT_POLICY), true)
    assert.equal(needsRestart(DEFAULT_POLICY, { ...DEFAULT_POLICY }), false)
    assert.equal(needsRestart(DEFAULT_POLICY, { ...DEFAULT_POLICY, mode: 'ACTIVE_ORDER', locationIntervalSeconds: 12 }), true)
  })
  it('never gates on distance, and reports at least once a minute', () => {
    assert.equal(DEFAULT_POLICY.distanceFilterMeters, 0)
    assert.ok(DEFAULT_POLICY.locationIntervalSeconds! + DEFAULT_POLICY.jitterSeconds <= 60)
  })
  it('thins the OS fixes by time: one per interval, an early-ish one still counts', () => {
    assert.equal(keepFix(null, 1_000, 55), true)
    assert.equal(keepFix(0, 1_000, 55), false) // the OS repeating every second
    assert.equal(keepFix(0, 44_000, 55), true) // 0.8 × 55 s
    assert.equal(keepFix(0, 43_000, 55), false)
  })
  it('asks the OS for a fix in the foreground once the newest is a full interval old', () => {
    assert.equal(fixIsDue(null, 0, 55), true)
    assert.equal(fixIsDue(0, 54_000, 55), false)
    assert.equal(fixIsDue(0, 55_000, 55), true)
  })
})

describe('pending actions never show success the server did not confirm', () => {
  const accept: PendingAction = { id: 'a', kind: 'ACCEPT', idempotencyKey: 'k1', targetId: 'offer-1', payload: {}, status: 'UNCERTAIN', errorCode: null, createdAt: 0 }
  it('uncertain accept → confirmed only when the server shows the order', () => {
    assert.equal(reconcile([accept], { currentOfferId: null, activeOrderId: 12, activeOrderStatus: 'ASSIGNED' })[0].status, 'CONFIRMED')
  })
  it('uncertain accept → failed when the offer is gone and no order exists', () => {
    const [r] = reconcile([accept], { currentOfferId: null, activeOrderId: null, activeOrderStatus: null })
    assert.equal(r.status, 'FAILED')
    assert.equal(r.errorCode, 'OFFER_EXPIRED')
  })
  it('still offered → stays uncertain (retry with the SAME key)', () => {
    const [r] = reconcile([accept], { currentOfferId: 'offer-1', activeOrderId: null, activeOrderStatus: null })
    assert.equal(r.status, 'UNCERTAIN')
    assert.equal(r.idempotencyKey, 'k1')
  })
})
