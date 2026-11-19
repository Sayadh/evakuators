import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { measureClock, secondsLeft } from '../src/domain/countdown'
import { addFixes, nextChunk, removeSent, MAX_FIXES_PER_REQUEST, type Fix } from '../src/location/buffer'
import { fixIsDue, jittered, keepFix, needsRestart, osIntervalSeconds, DEFAULT_POLICY, IDLE_OS_SECONDS } from '../src/location/policy'
import { dueForRetry, isBusy, isNewerSnapshot, latestFor, reconcile, track, RETRY_GAP_MS, type PendingAction, type ServerView } from '../src/state/pendingActions'

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
  it('standing ↔ moving does not restart the OS task (no notification flash); online/offline and orders do', () => {
    const moving = { ...DEFAULT_POLICY, mode: 'IDLE_MOVING' as const, locationIntervalSeconds: 30 }
    assert.equal(needsRestart(DEFAULT_POLICY, moving), false)
    assert.equal(needsRestart(moving, DEFAULT_POLICY), false)
    assert.equal(needsRestart(DEFAULT_POLICY, { ...DEFAULT_POLICY, mode: 'OFF', locationIntervalSeconds: null }), true)
    // both idle modes ask the OS for the faster cadence; the app thins to the current one
    assert.equal(osIntervalSeconds(DEFAULT_POLICY), IDLE_OS_SECONDS)
    assert.equal(osIntervalSeconds(moving), 30)
    assert.equal(osIntervalSeconds({ ...DEFAULT_POLICY, mode: 'ACTIVE_ORDER', locationIntervalSeconds: 12 }), 12)
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
    assert.equal(reconcile([accept], { currentOfferId: null, activeOrderId: 12, activeOrderStatus: 'ASSIGNED', activeOrderAgreedAmd: null })[0].status, 'CONFIRMED')
  })
  it('uncertain accept → failed when the offer is gone and no order exists', () => {
    const [r] = reconcile([accept], { currentOfferId: null, activeOrderId: null, activeOrderStatus: null, activeOrderAgreedAmd: null })
    assert.equal(r.status, 'FAILED')
    assert.equal(r.errorCode, 'OFFER_EXPIRED')
  })
  it('still offered → stays uncertain (retry with the SAME key)', () => {
    const [r] = reconcile([accept], { currentOfferId: 'offer-1', activeOrderId: null, activeOrderStatus: null, activeOrderAgreedAmd: null })
    assert.equal(r.status, 'UNCERTAIN')
    assert.equal(r.idempotencyKey, 'k1')
  })
})

describe('pending actions on the order (2026-11-19)', () => {
  const base: PendingAction = { id: 'p', kind: 'PROGRESS', idempotencyKey: 'kp', targetId: '12', payload: { action: 'ARRIVED', fromStatus: 'EN_ROUTE' }, status: 'UNCERTAIN', errorCode: null, createdAt: 0 }
  const view = (patch: Partial<ServerView> = {}): ServerView => ({ currentOfferId: null, activeOrderId: 12, activeOrderStatus: 'EN_ROUTE', activeOrderAgreedAmd: null, ...patch })

  it('an uncertain step is confirmed once the order moved on — the next step is not locked', () => {
    assert.equal(reconcile([base], view({ activeOrderStatus: 'ARRIVED' }))[0].status, 'CONFIRMED')
    assert.equal(reconcile([base], view({ activeOrderId: null, activeOrderStatus: null }))[0].status, 'CONFIRMED', 'order over')
  })
  it('…and stays uncertain (same key, re-sent) while the order still waits for it', () => {
    const [r] = reconcile([base], view())
    assert.equal(r.status, 'UNCERTAIN')
    assert.equal(r.idempotencyKey, 'kp')
  })
  it('an uncertain price is confirmed when the order shows it', () => {
    const price: PendingAction = { ...base, id: 'pr', kind: 'PRICE', payload: { agreedPriceAmd: 15000 } }
    assert.equal(reconcile([price], view({ activeOrderAgreedAmd: 15000 }))[0].status, 'CONFIRMED')
    assert.equal(reconcile([price], view({ activeOrderAgreedAmd: 12000 }))[0].status, 'UNCERTAIN')
  })
  it('an uncertain request is confirmed when the order is no longer his', () => {
    const request: PendingAction = { ...base, id: 'rq', kind: 'REQUEST', payload: { body: { kind: 'CANCEL' } } }
    assert.equal(reconcile([request], view({ activeOrderId: null }))[0].status, 'CONFIRMED')
    assert.equal(reconcile([request], view())[0].status, 'UNCERTAIN')
  })

  it('re-sends an uncertain action — but not more often than the gap', () => {
    const just = { ...base, lastAttemptAt: 10_000 }
    assert.deepEqual(dueForRetry([just], 10_000 + RETRY_GAP_MS - 1), [])
    assert.equal(dueForRetry([just], 10_000 + RETRY_GAP_MS).length, 1)
    assert.equal(dueForRetry([{ ...just, status: 'SENDING' }], 99_999).length, 0, 'in flight')
    assert.equal(dueForRetry([just], 10_001, 0).length, 1, 'reconnect: at once')
  })

  it('a second tap while one is on its way is busy; a settled one is not', () => {
    assert.equal(isBusy([{ ...base, status: 'SENDING' }], 'PROGRESS', '12'), true)
    assert.equal(isBusy([base], 'PROGRESS', '12'), true, 'uncertain')
    assert.equal(isBusy([{ ...base, status: 'FAILED' }], 'PROGRESS', '12'), false)
    assert.equal(isBusy([{ ...base, status: 'SENDING' }], 'PROGRESS', '13'), false, 'another order')
  })

  it('a new action replaces the old settled ones of its kind — an old failure does not stay under the next step', () => {
    const failed = { ...base, id: 'old', status: 'FAILED' as const, errorCode: 'CONFLICT' }
    const price = { ...base, id: 'price', kind: 'PRICE' as const, status: 'FAILED' as const }
    const next = { ...base, id: 'new', status: 'SENDING' as const, createdAt: 5 }
    const list = track([failed, price], next)
    assert.deepEqual(list.map((a) => a.id).sort(), ['new', 'price'])
    assert.equal(latestFor(list, 'PROGRESS', '12')?.id, 'new')
  })
  it('keeps the settled tail bounded over a long shift', () => {
    let list: PendingAction[] = []
    for (let i = 0; i < 100; i++) list = track(list, { ...base, id: `a${i}`, targetId: String(i), status: 'CONFIRMED', createdAt: i })
    assert.ok(list.length <= 21)
    assert.equal(latestFor(list, 'PROGRESS', '99')?.id, 'a99')
  })
  it('latestFor picks the newest, not the first in the list', () => {
    const older = { ...base, id: 'x', status: 'FAILED' as const, createdAt: 1 }
    const newer = { ...base, id: 'y', status: 'SENDING' as const, createdAt: 2 }
    assert.equal(latestFor([older, newer], 'PROGRESS', '12')?.id, 'y')
    assert.equal(latestFor([newer, older], 'PROGRESS', '12')?.id, 'y')
  })
})

describe('out-of-order snapshots are dropped (2026-11-19)', () => {
  it('applies the same or a newer server time, drops an older one', () => {
    const t = Date.parse('2026-11-19T10:00:05.000Z')
    assert.equal(isNewerSnapshot('2026-11-19T10:00:05.000Z', t), true)
    assert.equal(isNewerSnapshot('2026-11-19T10:00:06.000Z', t), true)
    assert.equal(isNewerSnapshot('2026-11-19T10:00:04.999Z', t), false)
    assert.equal(isNewerSnapshot('2026-11-19T10:00:00.000Z', null), true, 'first one')
    assert.equal(isNewerSnapshot('garbage', t), true, 'never blocks on a bad stamp')
  })
})
