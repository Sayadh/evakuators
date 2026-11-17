import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NET_ALERT_AFTER_MS, NET_ALERT_EVERY_MS, NET_ALERT_MAX, onNetFailure, onNetSuccess } from '../src/location/netAlert'

describe('«Ինտերնետ չկա» alert (2026-11-16)', () => {
  it('waits out a short blip, then alerts, then every 5 minutes, at most 3 times', () => {
    let state = onNetFailure(undefined, 0).state
    assert.equal(onNetFailure(state, NET_ALERT_AFTER_MS - 1).alert, false)
    let r = onNetFailure(state, NET_ALERT_AFTER_MS)
    assert.equal(r.alert, true)
    state = r.state
    assert.equal(onNetFailure(state, NET_ALERT_AFTER_MS + NET_ALERT_EVERY_MS - 1).alert, false)
    let t = NET_ALERT_AFTER_MS
    let alerts = 1
    for (let i = 0; i < 10; i++) {
      t += NET_ALERT_EVERY_MS
      r = onNetFailure(state, t)
      state = r.state
      if (r.alert) alerts++
    }
    assert.equal(alerts, NET_ALERT_MAX)
  })
  it('one successful send starts over and removes the notification', () => {
    const alerted = onNetFailure(onNetFailure(undefined, 0).state, NET_ALERT_AFTER_MS).state
    assert.deepEqual(onNetSuccess(alerted), { state: { failSince: null, count: 0, lastAt: null }, dismiss: true })
    assert.equal(onNetSuccess(undefined).dismiss, false)
  })
})
