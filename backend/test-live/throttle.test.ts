import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JwtService } from '@nestjs/jwt'
import { driverIdForThrottle } from '../src/common/ssr-aware-throttler.guard'

/** The rate-limit bucket of a driver-app request: per driver (verified token), never per forged token */
describe('throttle bucket per driver (2026-11-12)', () => {
  const secret = 'test-secret-0123456789'
  const jwt = new JwtService()

  it('a real driver-app token (as the login endpoint signs it) → that driver', async () => {
    const token = await jwt.signAsync({ sub: 42, sid: 's' }, { secret, expiresIn: '30d', audience: 'driver:app' })
    assert.equal(driverIdForThrottle(`Bearer ${token}`, secret), 42)
  })

  it('wrong secret, wrong audience, expired, garbage or none → null (bucket by IP)', async () => {
    const forged = await jwt.signAsync({ sub: 42, sid: 's' }, { secret: 'other', expiresIn: '30d', audience: 'driver:app' })
    const admin = await jwt.signAsync({ sub: 1, role: 'ADMIN' }, { secret, expiresIn: '1h', audience: 'admin' })
    const expired = await jwt.signAsync({ sub: 42, sid: 's', exp: Math.floor(Date.now() / 1000) - 10 }, { secret, audience: 'driver:app' })
    assert.equal(driverIdForThrottle(`Bearer ${forged}`, secret), null)
    assert.equal(driverIdForThrottle(`Bearer ${admin}`, secret), null)
    assert.equal(driverIdForThrottle(`Bearer ${expired}`, secret), null)
    assert.equal(driverIdForThrottle('Bearer a.b.c', secret), null)
    assert.equal(driverIdForThrottle(undefined, secret), null)
    assert.equal(driverIdForThrottle(`Bearer ${forged}`, ''), null, 'no secret configured → never trusted')
  })
})
