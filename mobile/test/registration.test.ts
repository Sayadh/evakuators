import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { EMPTY_REGISTRATION, LOGIN_ERROR_CODES, loginErrorKey, normalisePhone, REGISTER_ERROR_CODES, validateRegistration } from '../src/domain/registration'
import { hy } from '../src/i18n/hy'
import { translate } from '../src/i18n'

const valid = {
  ...EMPTY_REGISTRATION,
  phone: '+374 91 00-00-01',
  password: 'secret-123',
  passwordRepeat: 'secret-123',
  driverName: '  Արամ   Պ. ',
  vehicleType: 'flatbed' as const,
  capacityTons: '3,5',
}

describe('sign-up form', () => {
  it('a valid form becomes the server payload (normalised)', () => {
    const r = validateRegistration(valid)
    assert.ok(r.ok)
    assert.deepEqual(r.payload, {
      phone: '+37491000001',
      password: 'secret-123',
      driverName: 'Արամ Պ.',
      vehicleType: 'flatbed',
      capacityTons: 3.5,
      maxLoadTons: null,
      manipulator: false,
      wheelSkates: false,
      vehicleDescription: null,
    })
  })
  it('flags every bad field at once', () => {
    const r = validateRegistration({ ...EMPTY_REGISTRATION, phone: '091', password: 'short', passwordRepeat: 'x', maxLoadTons: '900' })
    assert.ok(!r.ok)
    assert.deepEqual(Object.keys(r.errors).sort(), ['capacityTons', 'driverName', 'maxLoadTons', 'password', 'passwordRepeat', 'phone', 'vehicleType'])
  })
  it('normalises phone separators only', () => {
    assert.equal(normalisePhone('+374 (91) 00-00-01'), '+37491000001')
  })
})

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
