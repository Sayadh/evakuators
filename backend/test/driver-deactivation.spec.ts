import 'reflect-metadata'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { DeactivationReason } from '@prisma/client'
import bcrypt from 'bcrypt'
import { describe, expect, it, vi } from 'vitest'
import { DriverAuthService } from '../src/driver-auth/driver-auth.service'

/**
 * Who may still sign in after being taken off the site.
 *
 * The whole point of recording a reason is this branch: one kind of
 * deactivation is a bill the driver can settle themselves, the other is a
 * decision only a person can undo. Getting it backwards means either a banned
 * driver holding a working token, or a driver who owes 3 000 ֏ with no way to
 * pay it but to phone us.
 */

const PASSWORD = 'test-password'

async function buildService(
  truck: { isActive: boolean; deactivationReason?: DeactivationReason | null } | null,
): Promise<DriverAuthService> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const repository = {
    findByMainPhoneAnyStatus: vi.fn(async () =>
      truck
        ? {
            id: 7,
            slug: 'test-driver',
            passwordHash,
            mustChangePassword: false,
            isActive: truck.isActive,
            deactivationReason: truck.deactivationReason ?? null,
          }
        : null,
    ),
  }
  const jwt = { signAsync: vi.fn(async () => 'signed-token') }
  const privacyConsent = { requiresConsent: vi.fn(async () => false) }
  const config = { getOrThrow: () => 'a-secret-long-enough-for-tests' }

  return new DriverAuthService(
    repository as never,
    jwt as never,
    privacyConsent as never,
    config as never,
  )
}

describe('DriverAuthService.login — deactivated drivers', () => {
  it('lets an unpaid-deactivated driver in, so they can pay their way back', async () => {
    const service = await buildService({
      isActive: false,
      deactivationReason: DeactivationReason.UNPAID,
    })
    await expect(service.login('+37491000001', PASSWORD)).resolves.toMatchObject({
      token: 'signed-token',
      towTruckId: 7,
    })
  })

  it('refuses a driver deactivated for any other reason', async () => {
    const service = await buildService({
      isActive: false,
      deactivationReason: DeactivationReason.OTHER,
    })
    await expect(service.login('+37491000001', PASSWORD)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a deactivation with no reason recorded — the safe direction', async () => {
    // Every driver deactivated before the column existed. We cannot tell after
    // the fact whether they were banned, so we do not guess in their favour.
    const service = await buildService({ isActive: false, deactivationReason: null })
    await expect(service.login('+37491000001', PASSWORD)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('still lets an ordinary active driver in', async () => {
    const service = await buildService({ isActive: true })
    await expect(service.login('+37491000001', PASSWORD)).resolves.toMatchObject({ towTruckId: 7 })
  })

  it('answers 401, not 403, for a wrong password on a deactivated account', async () => {
    // Order matters: the deactivation check sits AFTER the password check, so
    // the 403 never becomes an oracle for "this number exists and is banned".
    const service = await buildService({
      isActive: false,
      deactivationReason: DeactivationReason.OTHER,
    })
    await expect(service.login('+37491000001', 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('answers 401 for a phone nobody has', async () => {
    const service = await buildService(null)
    await expect(service.login('+37499999999', PASSWORD)).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })
})
