import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideProblemAlert, PROBLEM_ALERT_EVERY_SECONDS, PROBLEM_ALERT_MAX } from '../src/live-dispatch/notify/problem-alert'

const rules = { heartbeatMaxAgeSeconds: 90, gpsMaxAgeSeconds: 120 }
const none = { reason: null, count: 0, lastAtAgeSeconds: null }

describe('problem alerts (2026-11-16)', () => {
  it('a healthy driver gets nothing; a cleared problem is reset', () => {
    assert.deepEqual(decideProblemAlert({ heartbeatAgeSeconds: 10, gpsAgeSeconds: 20, stored: none }, rules), { kind: 'none' })
    assert.deepEqual(decideProblemAlert({ heartbeatAgeSeconds: 10, gpsAgeSeconds: 20, stored: { reason: 'GPS', count: 2, lastAtAgeSeconds: 30 } }, rules), { kind: 'clear' })
  })
  it('connection: only after the console limit plus the wake push grace (3 min — a Doze nap is not a problem)', () => {
    assert.equal(decideProblemAlert({ heartbeatAgeSeconds: 120, gpsAgeSeconds: 500, stored: none }, rules).kind, 'none')
    assert.equal(decideProblemAlert({ heartbeatAgeSeconds: 260, gpsAgeSeconds: 500, stored: none }, rules).kind, 'none', 'a few minutes of deep Doze: no alert')
    assert.deepEqual(decideProblemAlert({ heartbeatAgeSeconds: 300, gpsAgeSeconds: 500, stored: none }, rules), { kind: 'send', reason: 'CONNECTION', count: 1 })
  })
  it('GPS: a short gap (Doze) is quiet; a lasting one is told', () => {
    assert.equal(decideProblemAlert({ heartbeatAgeSeconds: 10, gpsAgeSeconds: 280, stored: none }, rules).kind, 'none')
  })
  it('GPS: the app answers but no fresh fix (or none at all)', () => {
    assert.deepEqual(decideProblemAlert({ heartbeatAgeSeconds: 10, gpsAgeSeconds: 400, stored: none }, rules), { kind: 'send', reason: 'GPS', count: 1 })
    assert.deepEqual(decideProblemAlert({ heartbeatAgeSeconds: 10, gpsAgeSeconds: null, stored: none }, rules), { kind: 'send', reason: 'GPS', count: 1 })
  })
  it('repeats every 5 minutes, at most 3 times; a different problem starts over', () => {
    const gps = { heartbeatAgeSeconds: 10, gpsAgeSeconds: 400 }
    assert.equal(decideProblemAlert({ ...gps, stored: { reason: 'GPS', count: 1, lastAtAgeSeconds: PROBLEM_ALERT_EVERY_SECONDS - 1 } }, rules).kind, 'none')
    assert.deepEqual(decideProblemAlert({ ...gps, stored: { reason: 'GPS', count: 1, lastAtAgeSeconds: PROBLEM_ALERT_EVERY_SECONDS } }, rules), { kind: 'send', reason: 'GPS', count: 2 })
    assert.equal(decideProblemAlert({ ...gps, stored: { reason: 'GPS', count: PROBLEM_ALERT_MAX, lastAtAgeSeconds: 9999 } }, rules).kind, 'none')
    assert.deepEqual(decideProblemAlert({ heartbeatAgeSeconds: 300, gpsAgeSeconds: 400, stored: { reason: 'GPS', count: 3, lastAtAgeSeconds: 10 } }, rules), { kind: 'send', reason: 'CONNECTION', count: 1 })
  })
})
