import 'reflect-metadata'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { validateSync } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcrypt'
import { DriverAuthService } from '../src/driver-auth/driver-auth.service'
import { DriverJwtGuard } from '../src/driver-auth/driver-jwt.guard'
import { ChangePasswordDto } from '../src/driver-auth/dto/change-password.dto'
import { DriverLoginDto } from '../src/driver-auth/dto/driver-login.dto'
import {
  generateTemporaryPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../src/driver-auth/driver-password'
import { MyTowTruckController } from '../src/my-tow-truck/my-tow-truck.controller'

/**
 * Driver password login.
 *
 * The rules worth pinning here are the ones whose failure is silent: a
 * generated password that is guessable or unreadable, a login that reveals
 * which phone numbers exist, and — above all — the condition under which a
 * Telegram re-link is allowed to overwrite a password. That last one is the
 * security boundary of the whole handover flow, and nothing else in the system
 * would notice if it inverted.
 */

/** Bcrypt at cost 12 is slow on purpose; these tests hash a handful of times. */
const TEST_TIMEOUT_MS = 20_000

function buildLoginDto(phone: unknown, password: unknown): DriverLoginDto {
  const dto = new DriverLoginDto()
  Object.assign(dto, { phone, password })
  return dto
}

function buildChangeDto(currentPassword: unknown, newPassword: unknown): ChangePasswordDto {
  const dto = new ChangePasswordDto()
  Object.assign(dto, { currentPassword, newPassword })
  return dto
}

function failedProperties(dto: object): string[] {
  return validateSync(dto).map((error) => error.property)
}

describe('generateTemporaryPassword', () => {
  const passwords = Array.from({ length: 200 }, () => generateTemporaryPassword())

  it('is long enough to satisfy the rule it will later be checked against', () => {
    // A generated password that could not itself be re-entered as a new one
    // would mean the two halves of the feature disagree about what a password
    // is. Guards against GENERATED_LENGTH drifting below PASSWORD_MIN_LENGTH.
    for (const password of passwords) {
      expect(password.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH)
      expect(password.length).toBeLessThanOrEqual(PASSWORD_MAX_LENGTH)
    }
  })

  it('never emits a character that can be misread for another', () => {
    // This password is read off a phone screen and typed back in. 0/O and
    // 1/I/L are the pairs that cost support calls; lowercase is excluded so
    // autocapitalisation can never change the password on the way in.
    for (const password of passwords) {
      expect(password).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
    }
  })

  it('does not repeat itself', () => {
    // A weak assertion about entropy, but it catches the failure that matters:
    // a generator seeded once, or one returning a constant, would collapse to a
    // handful of distinct values across 200 draws.
    expect(new Set(passwords).size).toBe(passwords.length)
  })
})

describe('DriverLoginDto', () => {
  it('accepts a canonical phone and any non-empty password', () => {
    expect(failedProperties(buildLoginDto('+37491000001', 'a'))).toEqual([])
  })

  it('deliberately has no minimum length', () => {
    // A minimum on the LOGIN form would reject a password issued under an
    // older, shorter rule — locking out a real driver — and would tell an
    // attacker where to start guessing. The strength rule lives on
    // ChangePasswordDto, where a password is actually chosen.
    expect(failedProperties(buildLoginDto('+37491000001', 'short'))).toEqual([])
  })

  it('rejects a password past the point bcrypt stops reading', () => {
    // Bcrypt truncates at 72 bytes. Accepting a longer value would mean two
    // different passwords opening the same account.
    expect(failedProperties(buildLoginDto('+37491000001', 'x'.repeat(73)))).toContain('password')
  })

  it.each([
    ['spaces', '+374 91 000001'],
    ['no country code', '91000001'],
    ['too many digits', '+3749100000123'],
  ])('rejects a non-canonical phone (%s)', (_label, phone) => {
    // The phone is the lookup key and is compared exactly — a non-canonical
    // value could never match a stored row, so it has to fail as a format
    // error rather than as "profile not found".
    expect(failedProperties(buildLoginDto(phone, 'password123'))).toContain('phone')
  })
})

describe('ChangePasswordDto', () => {
  it('accepts a long enough new password', () => {
    expect(failedProperties(buildChangeDto('OLDPASS12', 'my-new-password'))).toEqual([])
  })

  it('enforces the minimum only on the new password', () => {
    const failed = failedProperties(buildChangeDto('x', 'short'))
    expect(failed).toContain('newPassword')
    expect(failed).not.toContain('currentPassword')
  })

  it('requires the current password to be present', () => {
    expect(failedProperties(buildChangeDto(undefined, 'my-new-password'))).toContain(
      'currentPassword',
    )
  })
})

describe('PATCH /my/tow-truck/password', () => {
  it('is mounted on the driver-guarded controller', () => {
    // The truck id comes from the JWT, so the guard is what makes it impossible
    // to even express a change against someone else's account.
    const guards = Reflect.getMetadata(GUARDS_METADATA, MyTowTruckController) as unknown[]
    expect(guards).toContain(DriverJwtGuard)
    expect(
      Reflect.getMetadata(PATH_METADATA, MyTowTruckController.prototype.changePassword),
    ).toBe('password')
  })
})

describe('DriverAuthService', () => {
  const KNOWN_PASSWORD = 'driver-chosen-password'

  let repository: {
    findActiveByMainPhone: ReturnType<typeof vi.fn>
    findById: ReturnType<typeof vi.fn>
    setPassword: ReturnType<typeof vi.fn>
  }
  let service: DriverAuthService

  function build(): DriverAuthService {
    return new DriverAuthService(
      repository as never,
      { signAsync: vi.fn().mockResolvedValue('signed-token') } as never,
      { getOrThrow: () => 'test-driver-secret' } as never,
    )
  }

  beforeEach(() => {
    repository = {
      findActiveByMainPhone: vi.fn(),
      findById: vi.fn(),
      setPassword: vi.fn().mockResolvedValue(undefined),
    }
    service = build()
  })

  describe('login', () => {
    it(
      'issues a session for the right password',
      async () => {
        repository.findActiveByMainPhone.mockResolvedValue({
          id: 7,
          slug: 'test-truck',
          passwordHash: await bcrypt.hash(KNOWN_PASSWORD, 4),
          mustChangePassword: true,
        })

        const session = await service.login('+37491000001', KNOWN_PASSWORD)

        expect(session.towTruckId).toBe(7)
        expect(session.slug).toBe('test-truck')
        // Carried in the session rather than fetched later — the dashboard has
        // to know before it renders anything.
        expect(session.mustChangePassword).toBe(true)
      },
      TEST_TIMEOUT_MS,
    )

    it(
      'rejects the wrong password',
      async () => {
        repository.findActiveByMainPhone.mockResolvedValue({
          id: 7,
          slug: 'test-truck',
          passwordHash: await bcrypt.hash(KNOWN_PASSWORD, 4),
          mustChangePassword: false,
        })

        await expect(service.login('+37491000001', 'not-it')).rejects.toBeInstanceOf(
          UnauthorizedException,
        )
      },
      TEST_TIMEOUT_MS,
    )

    it(
      'rejects a driver who has no password yet, whatever is sent',
      async () => {
        // A null hash means "never tapped their Telegram link". The empty
        // string is the case worth pinning: bcrypt.compare('', null) must not
        // become a way in, which is why the null check is separate from the
        // comparison rather than folded into it.
        repository.findActiveByMainPhone.mockResolvedValue({
          id: 7,
          slug: 'test-truck',
          passwordHash: null,
          mustChangePassword: false,
        })

        await expect(service.login('+37491000001', '')).rejects.toBeInstanceOf(
          UnauthorizedException,
        )
      },
      TEST_TIMEOUT_MS,
    )

    it(
      'gives an unknown number the same answer as a wrong password',
      async () => {
        repository.findActiveByMainPhone.mockResolvedValue(null)

        // Same exception AND same message: a different one would turn this
        // endpoint into a way to find out which numbers are registered.
        const unknown = await service.login('+37491000009', 'whatever').catch((e: Error) => e)
        expect(unknown).toBeInstanceOf(UnauthorizedException)

        repository.findActiveByMainPhone.mockResolvedValue({
          id: 7,
          slug: 'test-truck',
          passwordHash: await bcrypt.hash(KNOWN_PASSWORD, 4),
          mustChangePassword: false,
        })
        const wrong = await service.login('+37491000001', 'not-it').catch((e: Error) => e)

        expect((unknown as Error).message).toBe((wrong as Error).message)
      },
      TEST_TIMEOUT_MS,
    )
  })

  describe('issueTemporaryPassword', () => {
    it(
      'mints one for a driver who has never had a password',
      async () => {
        // mustChangePassword is false here — the column default — and that is
        // exactly the case a flag-only check would wrongly refuse.
        repository.findById.mockResolvedValue({
          id: 7,
          passwordHash: null,
          mustChangePassword: false,
        })

        const password = await service.issueTemporaryPassword(7)

        expect(password).not.toBeNull()
        expect(repository.setPassword).toHaveBeenCalledWith(7, expect.any(String), true)
        // The stored value is a hash of what was returned, never the value.
        const [, storedHash] = repository.setPassword.mock.calls[0] as [number, string, boolean]
        expect(storedHash).not.toBe(password)
        expect(await bcrypt.compare(password as string, storedHash)).toBe(true)
      },
      TEST_TIMEOUT_MS,
    )

    it(
      'replaces a temporary password with a different one',
      async () => {
        repository.findById.mockResolvedValue({
          id: 7,
          passwordHash: 'hash-of-an-earlier-temporary-password',
          mustChangePassword: true,
        })

        const first = await service.issueTemporaryPassword(7)
        const second = await service.issueTemporaryPassword(7)

        // Re-issuing rather than resending is what retires a password that has
        // been sitting readable in a Telegram chat the driver may have lost.
        expect(first).not.toBeNull()
        expect(first).not.toBe(second)
      },
      TEST_TIMEOUT_MS,
    )

    it(
      'refuses to touch a password the driver chose themselves',
      async () => {
        repository.findById.mockResolvedValue({
          id: 7,
          passwordHash: 'hash-of-a-password-the-driver-picked',
          mustChangePassword: false,
        })

        // THE security rule of the Telegram handover: a link proves possession
        // of a link, not of an identity, so re-linking must not be a password
        // reset. Returning null (rather than throwing) is what keeps the caller
        // unable to tell "refused" from "nothing to send".
        expect(await service.issueTemporaryPassword(7)).toBeNull()
        expect(repository.setPassword).not.toHaveBeenCalled()
      },
      TEST_TIMEOUT_MS,
    )
  })

  describe('changePassword', () => {
    it(
      'stores the new password and clears the forced-change flag',
      async () => {
        repository.findById.mockResolvedValue({
          id: 7,
          passwordHash: await bcrypt.hash('TEMP1234', 4),
          mustChangePassword: true,
        })

        await service.changePassword(7, 'TEMP1234', 'a-password-of-my-own')

        const [id, hash, mustChange] = repository.setPassword.mock.calls[0] as [
          number,
          string,
          boolean,
        ]
        expect(id).toBe(7)
        expect(mustChange).toBe(false)
        expect(await bcrypt.compare('a-password-of-my-own', hash)).toBe(true)
      },
      TEST_TIMEOUT_MS,
    )

    it(
      'answers 400, not 401, when the current password is wrong',
      async () => {
        repository.findById.mockResolvedValue({
          id: 7,
          passwordHash: await bcrypt.hash('TEMP1234', 4),
          mustChangePassword: true,
        })

        // Not a preference: the frontend logs a driver out on ANY 401 from a
        // `/my/*` path (apiClient.ts). A 401 here would throw them back to the
        // login page for a typo, losing the message that explains it.
        await expect(
          service.changePassword(7, 'wrong', 'a-password-of-my-own'),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(repository.setPassword).not.toHaveBeenCalled()
      },
      TEST_TIMEOUT_MS,
    )
  })
})
