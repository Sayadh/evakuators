import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toMobileReport } from '../src/telemetry/errorShape'

describe('mobile error reports (2026-11-17)', () => {
  it('a crash carries its message, stack, version and platform', () => {
    const report = toMobileReport(new TypeError('undefined is not a function'), { fatal: true, release: '1.0.0-a', platform: 'android 34' })
    assert.equal(report?.message, 'TypeError: undefined is not a function')
    assert.ok(report?.stack)
    assert.equal(report?.release, '1.0.0-a')
    assert.deepEqual(report?.context, { fatal: true, platform: 'android 34' })
  })
  it('network blips are not bugs', () => {
    assert.equal(toMobileReport(new TypeError('Network request failed'), {}), null)
  })
})
