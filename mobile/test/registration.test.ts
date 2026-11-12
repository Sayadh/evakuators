import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { LOGIN_ERROR_CODES, loginErrorKey, REGISTER_ERROR_CODES } from '../src/domain/registration'
import { hy } from '../src/i18n/hy'
import { translate } from '../src/i18n'

describe('login / sign-up messages', () => {
  it('every login and sign-up error code has Armenian text and exists on the server', () => {
    const server = readFileSync(`${__dirname}/../../backend/src/live-dispatch/platform/errors.ts`, 'utf8')
    for (const code of LOGIN_ERROR_CODES) {
      assert.notEqual(translate(hy, `loginErrors.${code}`), `loginErrors.${code}`, code)
      assert.ok(server.includes(`${code}:`), `${code} is not a server code`)
    }
    for (const code of REGISTER_ERROR_CODES) {
      assert.notEqual(translate(hy, `register.errors.${code}`), `register.errors.${code}`, code)
      assert.ok(server.includes(`${code}:`), `${code} is not a server code`)
    }
  })
  it('maps statuses without a code (the website login) to sensible messages', () => {
    assert.equal(loginErrorKey(401, 'SESSION_REVOKED'), 'loginErrors.INVALID_CREDENTIALS')
    assert.equal(loginErrorKey(403, 'HTTP_403'), 'login.deactivated')
    assert.equal(loginErrorKey(403, 'APP_ACCESS_NOT_GRANTED'), 'loginErrors.APP_ACCESS_NOT_GRANTED')
    assert.equal(loginErrorKey(null, null), 'errors.NETWORK')
    assert.equal(loginErrorKey(429, 'HTTP_429'), 'loginErrors.RATE_LIMITED')
  })
  it('every vehicle type has a label', () => {
    for (const type of ['flatbed', 'sliding-platform', 'manipulator', 'heavy-duty']) {
      assert.notEqual(translate(hy, `register.vehicleTypes.${type}`), `register.vehicleTypes.${type}`)
    }
  })
})
