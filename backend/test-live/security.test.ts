/**
 * 2026-11-12 security audit — the two fixes that are pure logic:
 * website sessions refuse other audiences, and wrong passwords are counted
 * per account.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JwtService } from '@nestjs/jwt'
import { DRIVER_SITE_AUDIENCE, isSiteAudience } from '../src/driver-auth/driver-site-token'
import { LoginAttemptLimiter } from '../src/common/login-attempts'

describe('website driver session audience', () => {
  const jwt = new JwtService({})
  const secret = 'test-secret-at-least-16'
  const audienceOf = async (token: string) => (await jwt.verifyAsync<{ aud?: unknown }>(token, { secret })).aud

  it('accepts its own tokens and the older ones without an audience', async () => {
    assert.equal(isSiteAudience(await audienceOf(await jwt.signAsync({ sub: 7 }, { secret, audience: DRIVER_SITE_AUDIENCE }))), true)
    assert.equal(isSiteAudience(await audienceOf(await jwt.signAsync({ sub: 7 }, { secret }))), true)
  })
  it('refuses an app session and a wallet pay link signed with the same secret', async () => {
    assert.equal(isSiteAudience(await audienceOf(await jwt.signAsync({ sub: 7, sid: 'x' }, { secret, audience: 'driver:app' }))), false)
    assert.equal(isSiteAudience(await audienceOf(await jwt.signAsync({ pid: 1, sub: 7 }, { secret, audience: 'driver:wallet-pay' }))), false)
    assert.equal(isSiteAudience(['driver:site', 'driver:app']), false)
  })
})

describe('per-account sign-in limiter', () => {
  it('locks an account after N wrong passwords, for the window, whatever the IP', () => {
    let now = 0
    const limiter = new LoginAttemptLimiter(3, 60_000, () => now)
    for (let i = 0; i < 3; i++) {
      assert.equal(limiter.retryAfterSeconds('app:+37400000001'), 0)
      limiter.failed('app:+37400000001')
    }
    assert.ok(limiter.retryAfterSeconds('app:+37400000001') > 0)
    assert.equal(limiter.retryAfterSeconds('app:+37400000002'), 0, 'other accounts unaffected')
    now = 60_001
    assert.equal(limiter.retryAfterSeconds('app:+37400000001'), 0, 'unlocks after the window')
  })
  it('a correct password resets the count', () => {
    const limiter = new LoginAttemptLimiter(3, 60_000, () => 0)
    limiter.failed('k')
    limiter.failed('k')
    limiter.succeeded('k')
    limiter.failed('k')
    assert.equal(limiter.retryAfterSeconds('k'), 0)
  })
})
