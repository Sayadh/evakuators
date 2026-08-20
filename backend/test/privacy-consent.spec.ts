import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { describe, expect, it, vi } from 'vitest'
import { AcceptPrivacyConsentDto } from '../src/privacy-consent/dto/accept-privacy-consent.dto'
import { CONSENT_AUDIT_RETENTION_DAYS } from '../src/privacy-consent/privacy-consent.constants'
import { PrivacyConsentService } from '../src/privacy-consent/privacy-consent.service'
import {
  PRIVACY_CONSENT_TEXT,
  PRIVACY_CONSENT_TEXT_HASH,
  PRIVACY_POLICY_VERSION,
} from '../src/privacy-consent/privacy-consent.text'
import { CreateRegistrationDto } from '../src/registration/dto/create-registration.dto'

/**
 * Consent to the processing and publication of a driver's personal data.
 *
 * The properties worth pinning are not "it writes a row" but the ones that make
 * the row worth anything: that an unticked box cannot become a consent, that the
 * hash is the server's and never the client's, that a double-tap is one consent
 * rather than two, and that nobody was backfilled into consenting.
 */

const CONTEXT = { ipHash: 'a'.repeat(64), userAgent: 'Mozilla/5.0 (test)' }

/** A live consent row, as the repository would return it */
function liveConsent(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    towTruckId: 7,
    registrationRequestId: null,
    policyVersion: PRIVACY_POLICY_VERSION,
    consentTextHash: PRIVACY_CONSENT_TEXT_HASH,
    acceptedAt: new Date('2026-08-15T10:00:00.000Z'),
    revokedAt: null,
    ipHash: CONTEXT.ipHash,
    userAgent: CONTEXT.userAgent,
    source: 'EXISTING_DRIVER',
    createdAt: new Date('2026-08-15T10:00:00.000Z'),
    ...overrides,
  }
}

function build(overrides: { live?: unknown } = {}) {
  const create = vi.fn((data: Record<string, unknown>) =>
    Promise.resolve({ ...liveConsent(), ...data, acceptedAt: new Date('2026-08-20T12:00:00.000Z') }),
  )
  const revokeAllForTruck = vi.fn(() => Promise.resolve(1))
  const attachRegistrationConsentToTruck = vi.fn(() => Promise.resolve(1))
  const purgeRevokedBefore = vi.fn(() => Promise.resolve(0))

  const repository = {
    create,
    revokeAllForTruck,
    attachRegistrationConsentToTruck,
    purgeRevokedBefore,
    findLiveForTruck: vi.fn(() => Promise.resolve(overrides.live ?? null)),
    findAllForTruck: vi.fn(() => Promise.resolve([])),
  }

  const service = new PrivacyConsentService(repository as never)
  return {
    service,
    repository,
    create,
    revokeAllForTruck,
    attachRegistrationConsentToTruck,
    purgeRevokedBefore,
  }
}

/** Runs the DTO through the same validation pipeline Nest applies */
function validateDto<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(cls, payload) as object, {
    whitelist: true,
    forbidNonWhitelisted: false,
  })
}

/** A registration payload that is valid apart from whatever the test changes */
const REGISTRATION_BASE = {
  firstName: 'Աշոտ',
  lastName: 'Աշոտյան',
  phone: '+37491000001',
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
  imageIds: [1],
}

describe('1 — a registration without consent is refused', () => {
  it('rejects the DTO when the box was not ticked', () => {
    const errors = validateDto(CreateRegistrationDto, {
      ...REGISTRATION_BASE,
      privacyConsentAccepted: false,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    })

    // `@Equals(true)`, not `@IsBoolean()` — `false` has to be as fatal as an
    // omission, or the whole requirement is a suggestion. This is the boundary;
    // the frontend's disabled button is only a courtesy.
    expect(errors.some((error) => error.property === 'privacyConsentAccepted')).toBe(true)
  })

  it('rejects the DTO when the field is missing entirely', () => {
    const errors = validateDto(CreateRegistrationDto, {
      ...REGISTRATION_BASE,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    })

    expect(errors.some((error) => error.property === 'privacyConsentAccepted')).toBe(true)
  })

  it('rejects the DTO when the version is missing', () => {
    // Without a version there is nothing to check a stale tab against, so an
    // omission cannot be treated as "presumably the current one".
    const errors = validateDto(CreateRegistrationDto, {
      ...REGISTRATION_BASE,
      privacyConsentAccepted: true,
    })

    expect(errors.some((error) => error.property === 'privacyPolicyVersion')).toBe(true)
  })
})

describe('2 — a registration with the current version is accepted', () => {
  it('passes validation', () => {
    const errors = validateDto(CreateRegistrationDto, {
      ...REGISTRATION_BASE,
      privacyConsentAccepted: true,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    })

    expect(errors.filter((error) => error.property.startsWith('privacy'))).toEqual([])
  })

  it('writes the consent inside the caller’s transaction, against the request', async () => {
    const { service, create } = build()
    const tx = { marker: 'transaction-client' }

    await service.acceptForRegistration(42, PRIVACY_POLICY_VERSION, CONTEXT, tx as never)

    // The transaction client is passed through, not quietly ignored: a
    // registration stored without its consent is a driver's data held with no
    // record of permission to hold it.
    expect(create).toHaveBeenCalledWith(expect.any(Object), tx)

    const [data] = create.mock.calls[0]!
    // Attached to the REQUEST, because the truck does not exist yet and may
    // never exist — the request can sit in the queue for days and be rejected.
    expect(data.registrationRequestId).toBe(42)
    expect(data.towTruckId).toBeUndefined()
    expect(data.source).toBe('REGISTRATION')
  })
})

describe('3 — an existing driver with no consent is asked', () => {
  it('reports requiresPrivacyConsent for a driver with no rows at all', async () => {
    // The ~100 drivers published before this feature existed. Nothing was
    // backfilled — see the migration — so every one of them looks exactly like
    // this until they actually tick the box.
    const { service } = build({ live: null })

    expect(await service.getStatus(7)).toEqual({
      requiresPrivacyConsent: true,
      policyVersion: PRIVACY_POLICY_VERSION,
      acceptedAt: null,
    })
    expect(await service.requiresConsent(7)).toBe(true)
  })

  it('asks again after a withdrawal, because a withdrawn consent is not live', async () => {
    // `findLiveForTruck` filters on `revokedAt: null`, so a withdrawn row stops
    // answering even though it stays in the table forever as history.
    const { service } = build({ live: null })
    expect(await service.requiresConsent(7)).toBe(true)
  })
})

describe('4 — once accepted, the dialog does not come back', () => {
  it('reports no consent required for a driver with a live row', async () => {
    const { service } = build({ live: liveConsent() })

    expect(await service.getStatus(7)).toEqual({
      requiresPrivacyConsent: false,
      policyVersion: PRIVACY_POLICY_VERSION,
      acceptedAt: '2026-08-15T10:00:00.000Z',
    })
  })

  it('records the consent and reports the block is over', async () => {
    const { service, create } = build({ live: null })

    const status = await service.acceptForDriver(7, PRIVACY_POLICY_VERSION, CONTEXT)

    expect(status.requiresPrivacyConsent).toBe(false)
    expect(create).toHaveBeenCalledOnce()

    const [data] = create.mock.calls[0]!
    expect(data.towTruckId).toBe(7)
    expect(data.source).toBe('EXISTING_DRIVER')
  })
})

describe('5 — a stale or wrong policy version is refused', () => {
  it('refuses an older version rather than silently upgrading it', async () => {
    const { service, create } = build({ live: null })

    await expect(service.acceptForDriver(7, '1.0', CONTEXT)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    // The critical half: nothing was written. Silently recording it as the
    // current version would store an attestation to a document the driver's
    // stale tab never displayed — a false record, which is worse than none.
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a version from the future, not just an older one', async () => {
    const { service } = build({ live: null })
    await expect(service.acceptForDriver(7, '9.9', CONTEXT)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('refuses it on the registration path too', async () => {
    const { service, create } = build()

    await expect(
      service.acceptForRegistration(42, '1.0', CONTEXT, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(create).not.toHaveBeenCalled()
  })

  it('names the current version, so the message is actionable', async () => {
    const { service } = build({ live: null })

    await expect(service.acceptForDriver(7, '1.0', CONTEXT)).rejects.toThrow(
      new RegExp(PRIVACY_POLICY_VERSION.replace('.', '\\.')),
    )
  })
})

describe('6 — a repeated request does not create a second consent', () => {
  it('returns the FIRST acceptance and writes nothing on a double tap', async () => {
    const { service, create } = build({ live: liveConsent() })

    const status = await service.acceptForDriver(7, PRIVACY_POLICY_VERSION, CONTEXT)

    expect(create).not.toHaveBeenCalled()
    // The original timestamp, not `now`. The audit history has to say the
    // driver consented once, at the moment they actually did — a retried fetch
    // or a double-tapped button is not a second act of consenting.
    expect(status.acceptedAt).toBe('2026-08-15T10:00:00.000Z')
    expect(status.requiresPrivacyConsent).toBe(false)
  })

  it('is idempotent when withdrawing too', async () => {
    const { service, revokeAllForTruck } = build()
    revokeAllForTruck.mockResolvedValueOnce(0)

    // Nothing to withdraw is not an error: withdrawing twice means the same
    // thing both times.
    await expect(service.revokeForDriver(7)).resolves.toEqual({ revoked: 0 })
  })
})

describe('7 — a driver cannot touch another driver’s consent', () => {
  it('only ever queries and writes the id it was given', async () => {
    const { service, repository, create } = build({ live: null })

    await service.acceptForDriver(7, PRIVACY_POLICY_VERSION, CONTEXT)

    expect(repository.findLiveForTruck).toHaveBeenCalledWith(7, PRIVACY_POLICY_VERSION)
    expect(create.mock.calls[0]![0].towTruckId).toBe(7)
  })

  it('takes the truck id from the JWT, never from the body', () => {
    // The structural half of the guarantee, and the one that cannot be
    // forgotten in a future code path: there is no id field on the payload at
    // all, so a request to change someone else's consent is not merely
    // rejected — it cannot be expressed. See PrivacyConsentController.
    const dto = plainToInstance(AcceptPrivacyConsentDto, {
      policyVersion: PRIVACY_POLICY_VERSION,
      accepted: true,
      towTruckId: 999,
    }) as Record<string, unknown>

    const errors = validateSync(dto as object, { whitelist: true, forbidNonWhitelisted: true })
    // `whitelist` strips it, and `forbidNonWhitelisted` makes the attempt an
    // outright error rather than a silent drop.
    expect(errors.some((error) => error.property === 'towTruckId')).toBe(true)
  })

  it('scopes a withdrawal to the caller as well', async () => {
    const { service, revokeAllForTruck } = build()
    await service.revokeForDriver(7)
    expect(revokeAllForTruck).toHaveBeenCalledWith(7, expect.any(Date))
  })
})

describe('the hash is the server’s, and is stable', () => {
  it('stores the server’s own hash, not anything from the request', async () => {
    const { service, create } = build({ live: null })

    await service.acceptForDriver(7, PRIVACY_POLICY_VERSION, CONTEXT)

    expect(create.mock.calls[0]![0].consentTextHash).toBe(PRIVACY_CONSENT_TEXT_HASH)
  })

  it('has no hash field on the accept DTO at all', () => {
    // A hash supplied by the caller proves only that the caller can run
    // SHA-256. Accepting one would let a crafted request store an attestation
    // to text nobody was ever shown — which looks like evidence and is not.
    const dto = plainToInstance(AcceptPrivacyConsentDto, {
      policyVersion: PRIVACY_POLICY_VERSION,
      accepted: true,
      consentTextHash: 'f'.repeat(64),
    }) as Record<string, unknown>

    const errors = validateSync(dto as object, { whitelist: true, forbidNonWhitelisted: true })
    expect(errors.some((error) => error.property === 'consentTextHash')).toBe(true)
  })

  it('is a 64-character hex sha256 of the canonical text', () => {
    expect(PRIVACY_CONSENT_TEXT_HASH).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when the text changes, and not otherwise', async () => {
    // The property that makes the stored hash worth storing: it is a
    // fingerprint of this exact wording, so a consent recorded today can still
    // be checked against today's text years after the file has moved on.
    const { createHash } = await import('node:crypto')
    const recomputed = createHash('sha256').update(PRIVACY_CONSENT_TEXT, 'utf8').digest('hex')

    expect(recomputed).toBe(PRIVACY_CONSENT_TEXT_HASH)
  })

  it('covers the checkbox label, not only the explanation', () => {
    // The checkbox IS the act of consenting. A record that hashed only the
    // paragraphs above it would not attest to the sentence the driver ticked.
    expect(PRIVACY_CONSENT_TEXT).toContain('Ծանոթացել եմ Գաղտնիության քաղաքականությանը')
  })

  it('includes the version, so two policies sharing wording still differ', () => {
    expect(PRIVACY_CONSENT_TEXT.startsWith(`v${PRIVACY_POLICY_VERSION}`)).toBe(true)
  })
})

describe('approval carries the registration’s consent onto the truck', () => {
  it('re-points the same row rather than writing a new one', async () => {
    const { service, attachRegistrationConsentToTruck, create } = build()
    const tx = { marker: 'approve-transaction' }

    await service.attachToTowTruck(42, 7, tx as never)

    expect(attachRegistrationConsentToTruck).toHaveBeenCalledWith(42, 7, tx)
    // No new row. A fresh consent here would assert the driver consented on the
    // day a moderator got round to them, in a table whose only job is to be
    // accurate about exactly that.
    expect(create).not.toHaveBeenCalled()
  })

  it('is a no-op for a request filed before consent was ever asked for', async () => {
    const { service, attachRegistrationConsentToTruck } = build()
    attachRegistrationConsentToTruck.mockResolvedValueOnce(0)

    // Those requests are still in the queue and still approvable. Throwing here
    // would make them unapprovable, and their drivers are caught by the
    // dashboard gate on first login anyway.
    await expect(service.attachToTowTruck(42, 7, {} as never)).resolves.toBeUndefined()
  })
})

describe('the audit fields', () => {
  it('stores the hashed IP and the User-Agent it was given', async () => {
    const { service, create } = build({ live: null })

    await service.acceptForDriver(7, PRIVACY_POLICY_VERSION, CONTEXT)

    const [data] = create.mock.calls[0]!
    expect(data.ipHash).toBe(CONTEXT.ipHash)
    expect(data.userAgent).toBe(CONTEXT.userAgent)
  })

  it('accepts a null ipHash rather than inventing one', async () => {
    // A request can legitimately arrive with no resolvable address. Null means
    // "not captured", which is honest; hashing the empty string would give
    // every uncaptured request one shared, real-looking value.
    const { service, create } = build({ live: null })

    await service.acceptForDriver(7, PRIVACY_POLICY_VERSION, { ipHash: null, userAgent: null })

    expect(create.mock.calls[0]![0].ipHash).toBeNull()
  })

  it('keeps the raw consent text out of what is stored', async () => {
    const { service, create } = build({ live: null })

    await service.acceptForDriver(7, PRIVACY_POLICY_VERSION, CONTEXT)

    // Only the hash is kept. The text itself lives in source control, where it
    // is versioned and diffable, rather than being duplicated into every row.
    expect(JSON.stringify(create.mock.calls[0]![0])).not.toContain('Evakuators.am-ում Ձեր էջը')
  })

  it('projects the history, withholding the forensic columns', async () => {
    const { service, repository } = build()
    repository.findAllForTruck.mockResolvedValueOnce([liveConsent()] as never)

    const [entry] = await service.historyForDriver(7)

    expect(entry).toEqual({
      policyVersion: PRIVACY_POLICY_VERSION,
      acceptedAt: '2026-08-15T10:00:00.000Z',
      revokedAt: null,
      source: 'EXISTING_DRIVER',
    })
    // `ipHash`, `userAgent` and `consentTextHash` answer a regulator's
    // question, not a driver's — an endpoint returning the whole row is how a
    // forensic column ends up rendered in a UI.
    expect(entry).not.toHaveProperty('ipHash')
    expect(entry).not.toHaveProperty('consentTextHash')
  })
})

describe('the retention purge', () => {
  it('purges by a cutoff measured from now, 3 years back', async () => {
    const { service, purgeRevokedBefore } = build()
    const before = Date.now()

    await service.purgeExpiredConsentHistory()

    expect(purgeRevokedBefore).toHaveBeenCalledOnce()
    const [cutoff] = purgeRevokedBefore.mock.calls[0]! as [Date]
    const expectedMs = before - CONSENT_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    // A window rather than an exact match — `Date.now()` ticks between `before`
    // and the call inside the service.
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(1000)
  })

  it('is a 3-year window, not the analytics module’s shorter one', () => {
    // The two purges answer different questions — this one protects proof of a
    // withdrawn consent, not a visitor-counting ledger — and must not silently
    // converge on one constant.
    expect(CONSENT_AUDIT_RETENTION_DAYS).toBe(365 * 3)
  })

  it('does not log anything when there was nothing to purge', async () => {
    const { service, purgeRevokedBefore } = build()
    purgeRevokedBefore.mockResolvedValueOnce(0)

    await expect(service.purgeExpiredConsentHistory()).resolves.toBeUndefined()
  })
})
