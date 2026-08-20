import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { DriverAuthService } from '../src/driver-auth/driver-auth.service'
import { PRIVACY_POLICY_VERSION } from '../src/privacy-consent/privacy-consent.text'
import { RegistrationService } from '../src/registration/registration.service'

/**
 * The two ends of the consent flow, at the service seam rather than at the DTO.
 *
 * `privacy-consent.spec.ts` covers the consent record itself. What is left, and
 * what actually breaks in production, is the wiring: does login report the flag,
 * and is a registration's consent written in the SAME transaction as the
 * request — not before it, not after it, not in a second call that a crash can
 * land between.
 */

const CONSENT_CONTEXT = { ipHash: 'b'.repeat(64), userAgent: 'Mozilla/5.0 (test)' }

// ── login ────────────────────────────────────────────────────────────────────

function buildAuth(overrides: { requiresConsent?: boolean } = {}) {
  const towTruck = {
    id: 7,
    slug: 'ashot',
    // A real bcrypt hash of 'correct-horse', cost 4 (fast enough for a test,
    // and the cost is irrelevant to what is being asserted). The genuine
    // `bcrypt.compare` has to run rather than being stubbed: the point of the
    // last test in this block is that a FAILED login skips the consent query,
    // and a faked comparison could not demonstrate that.
    passwordHash: '$2b$04$doY9EdZtwbCq0WDnykggSeS/w.Tm/T4X/atjBiHCBJrgzwjaQHegK',
    mustChangePassword: false,
  }

  const towTrucksRepository = {
    findActiveByMainPhone: vi.fn(() => Promise.resolve(towTruck)),
    findById: vi.fn(() => Promise.resolve(towTruck)),
    setPassword: vi.fn(() => Promise.resolve(towTruck)),
  }

  const requiresConsent = vi.fn(() => Promise.resolve(overrides.requiresConsent ?? true))
  const privacyConsent = { requiresConsent }

  const jwt = { signAsync: vi.fn(() => Promise.resolve('signed.jwt.token')) }
  const config = { getOrThrow: vi.fn(() => 'a-secret-at-least-16-chars') }

  const service = new DriverAuthService(
    towTrucksRepository as never,
    jwt as never,
    privacyConsent as never,
    config as never,
  )

  return { service, towTrucksRepository, requiresConsent, jwt }
}

describe('3 — login reports requiresPrivacyConsent for a legacy driver', () => {
  it('returns true for a driver with no consent record', async () => {
    // The ~100 drivers published before consent existed. Nothing was
    // backfilled, so this is what every one of them looks like on their next
    // login until they actually tick the box.
    const { service } = buildAuth({ requiresConsent: true })

    const session = await service.login('+37491000001', 'correct-horse')

    expect(session.requiresPrivacyConsent).toBe(true)
    // The rest of the session is untouched — this is an added field, not a
    // changed contract.
    expect(session.token).toBe('signed.jwt.token')
    expect(session.towTruckId).toBe(7)
    expect(session.mustChangePassword).toBe(false)
  })

  it('returns false once the driver has consented', async () => {
    const { service } = buildAuth({ requiresConsent: false })

    expect((await service.login('+37491000001', 'correct-horse')).requiresPrivacyConsent).toBe(
      false,
    )
  })

  it('asks about the authenticated truck, not about anything from the request', async () => {
    const { service, requiresConsent } = buildAuth()

    await service.login('+37491000001', 'correct-horse')

    expect(requiresConsent).toHaveBeenCalledWith(7)
  })

  it('does not run the consent query on a failed login', async () => {
    // Two reasons, and the second is the one that matters: it would be a wasted
    // query, and it would make a failed login for an existing phone measurably
    // slower than for an unknown one — reintroducing the timing oracle that
    // DUMMY_HASH exists to remove.
    const { service, requiresConsent } = buildAuth()

    await expect(service.login('+37491000001', 'wrong-password')).rejects.toThrow()
    expect(requiresConsent).not.toHaveBeenCalled()
  })
})

// ── registration ─────────────────────────────────────────────────────────────

const REGISTRATION_DTO = {
  firstName: 'Աշոտ',
  lastName: 'Աշոտյան',
  phone: '+37491000002',
  vehicleBrand: 'Isuzu',
  vehicleYear: 2018,
  vehicleType: 'flatbed',
  capacityRange: '2-3.5',
  winch: true,
  manipulator: false,
  wheelSkates: false,
  heavyEquipment: false,
  servesAllArmenia: false,
  regionSlugs: ['kotayk'],
  citySlugs: ['abovyan'],
  services: ['towing'],
  locationName: 'Աբովյան',
  description: 'նկարագրություն',
  imageIds: [11],
  privacyConsentAccepted: true,
  privacyPolicyVersion: PRIVACY_POLICY_VERSION,
}

function buildRegistration() {
  /**
   * Records the order in which things happened inside `create`, so the test can
   * assert the consent was written *during* the transaction rather than merely
   * that it was written at some point.
   */
  const order: string[] = []
  const TX = { marker: 'the-transaction-client' }

  const repository = {
    countUnattachedImages: vi.fn(() => Promise.resolve(1)),
    create: vi.fn(
      async (
        data: Record<string, unknown>,
        _imageIds: number[],
        recordConsent: (id: number, tx: unknown) => Promise<void>,
      ) => {
        order.push('request-created')
        await recordConsent(55, TX)
        order.push('transaction-committed')
        return { id: 55, status: 'PENDING', ...data }
      },
    ),
  }

  const acceptForRegistration = vi.fn(() => {
    order.push('consent-recorded')
    return Promise.resolve()
  })

  const service = new RegistrationService(
    repository as never,
    { notifyNewRegistration: vi.fn(() => Promise.resolve()) } as never,
    { findByMainPhoneAnyStatus: vi.fn(() => Promise.resolve(null)) } as never,
    { acceptForRegistration } as never,
  )

  return { service, repository, acceptForRegistration, order, TX }
}

describe('2 — a registration with the current version is stored with its consent', () => {
  it('writes the consent inside the request’s own transaction', async () => {
    const { service, acceptForRegistration, order, TX } = buildRegistration()

    await service.submit(REGISTRATION_DTO as never, CONSENT_CONTEXT)

    // Not "was called" — called BETWEEN the request being created and the
    // transaction closing. A registration stored without its consent is a
    // driver's data held with no record of permission to hold it, and a second
    // call after the commit is exactly how that happens.
    expect(order).toEqual(['request-created', 'consent-recorded', 'transaction-committed'])

    expect(acceptForRegistration).toHaveBeenCalledWith(
      55,
      PRIVACY_POLICY_VERSION,
      CONSENT_CONTEXT,
      TX,
    )
  })

  it('passes the hashed IP and User-Agent through untouched', async () => {
    const { service, acceptForRegistration } = buildRegistration()

    await service.submit(REGISTRATION_DTO as never, CONSENT_CONTEXT)

    expect(acceptForRegistration.mock.calls[0]![2]).toBe(CONSENT_CONTEXT)
  })

  it('keeps the consent fields out of the RegistrationRequest row', async () => {
    const { service, repository } = buildRegistration()

    await service.submit(REGISTRATION_DTO as never, CONSENT_CONTEXT)

    const [data] = repository.create.mock.calls[0]!
    // They describe an act of consenting, which has its own auditable table.
    // Left in, Prisma would reject the create — so this is also what stops a
    // future field being spread in by accident.
    expect(data).not.toHaveProperty('privacyConsentAccepted')
    expect(data).not.toHaveProperty('privacyPolicyVersion')
    expect(data).not.toHaveProperty('imageIds')
    // The real profile fields are still all there.
    expect(data.firstName).toBe('Աշոտ')
    expect(data.vehicleType).toBe('flatbed')
  })

  it('returns the created request', async () => {
    const { service } = buildRegistration()

    await expect(service.submit(REGISTRATION_DTO as never, CONSENT_CONTEXT)).resolves.toMatchObject(
      { id: 55, status: 'PENDING' },
    )
  })
})

describe('5 — a stale policy version stops the registration before anything is written', () => {
  it('rejects it', async () => {
    const { service } = buildRegistration()

    await expect(
      service.submit({ ...REGISTRATION_DTO, privacyPolicyVersion: '1.0' } as never, CONSENT_CONTEXT),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('creates neither the request nor the consent', async () => {
    const { service, repository, acceptForRegistration } = buildRegistration()

    await expect(
      service.submit({ ...REGISTRATION_DTO, privacyPolicyVersion: '1.0' } as never, CONSENT_CONTEXT),
    ).rejects.toThrow()

    expect(repository.create).not.toHaveBeenCalled()
    expect(acceptForRegistration).not.toHaveBeenCalled()
  })

  it('is checked before the phone lookup, so a stale tab costs no queries', async () => {
    // First in the method, deliberately: a tab left open across a policy change
    // should be told to reload rather than burning its 5-per-minute
    // registration budget on validation work that cannot be stored anyway.
    const { service, repository } = buildRegistration()

    await expect(
      service.submit({ ...REGISTRATION_DTO, privacyPolicyVersion: '1.0' } as never, CONSENT_CONTEXT),
    ).rejects.toThrow()

    expect(repository.countUnattachedImages).not.toHaveBeenCalled()
  })
})
