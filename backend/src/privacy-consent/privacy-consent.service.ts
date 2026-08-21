import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import type { DriverPrivacyConsent } from '@prisma/client'
import { PrivacyConsentSource } from '@prisma/client'
import type { ConsentRequestContext } from './consent-request-context'
import { CONSENT_AUDIT_PURGE_CRON, CONSENT_AUDIT_RETENTION_DAYS } from './privacy-consent.constants'
import type { ConsentTx } from './privacy-consent.repository'
import { PrivacyConsentRepository } from './privacy-consent.repository'
import {
  PRIVACY_CONSENT_TEXT_HASH,
  PRIVACY_POLICY_VERSION,
} from './privacy-consent.text'

/** What the dashboard needs in order to decide whether to block */
export interface PrivacyConsentStatusApi {
  /**
   * The single question the dashboard asks. True means "no live consent at the
   * current version", which covers all three ways of getting there — never
   * asked, asked at an older version, or withdrawn — and the dashboard does not
   * need to tell them apart.
   */
  requiresPrivacyConsent: boolean
  /** The version the driver would be consenting to, so a stale tab can notice */
  policyVersion: string
  /** When the live consent was given, or null when there is none */
  acceptedAt: string | null
}

/**
 * One row of a driver's own consent history.
 *
 * Deliberately a projection and not the Prisma row: `ipHash`, `userAgent` and
 * `consentTextHash` are audit fields that answer a regulator's question, not a
 * driver's, and an endpoint that returns everything the row holds is how a
 * forensic column ends up rendered in somebody's UI.
 */
export interface PrivacyConsentHistoryEntry {
  policyVersion: string
  acceptedAt: string
  revokedAt: string | null
  source: PrivacyConsentSource
}

@Injectable()
export class PrivacyConsentService {
  /**
   * Logs the FACT of a consent and nothing about its content.
   *
   * No consent text, no hash, no IP, no User-Agent, no phone number — a log
   * line is the least access-controlled artifact this system produces, it ends
   * up in files, in aggregators and in screenshots, and a consent record's
   * whole point is that it lives somewhere with a retention policy. The truck
   * id and the version are enough to correlate an incident with the row, which
   * is what an operator actually needs from a log.
   */
  private readonly logger = new Logger(PrivacyConsentService.name)

  constructor(private readonly repository: PrivacyConsentRepository) {}

  /**
   * Whether this driver still owes us a consent.
   *
   * Called on login (to populate the session flag) and by the dashboard's own
   * status endpoint. Both matter: the login answer is what the frontend caches,
   * and the endpoint is what stops a stale `localStorage` session from being
   * the only word on the subject — a driver who consented in another tab, or
   * whose flag predates a version bump, gets the truth on the next dashboard
   * load rather than on their next login.
   */
  async getStatus(towTruckId: number): Promise<PrivacyConsentStatusApi> {
    const live = await this.repository.findLiveForTruck(towTruckId, PRIVACY_POLICY_VERSION)

    return {
      requiresPrivacyConsent: live === null,
      policyVersion: PRIVACY_POLICY_VERSION,
      acceptedAt: live?.acceptedAt.toISOString() ?? null,
    }
  }

  /** The same question, reduced to the boolean the login response carries */
  async requiresConsent(towTruckId: number): Promise<boolean> {
    return (await this.repository.findLiveForTruck(towTruckId, PRIVACY_POLICY_VERSION)) === null
  }

  /**
   * Records an already-published driver's consent.
   *
   * ## Idempotent, and not merely tolerant of a double tap
   *
   * A second call returns the FIRST consent's `acceptedAt` rather than writing
   * a second row or refreshing the timestamp. That is the difference between
   * idempotent and "does not crash": the audit history must say the driver
   * consented once, at the moment they actually did, and a resubmitted request
   * — a double-tapped button, a retried fetch, a browser replaying a request
   * after a flaky connection — is not a second act of consenting.
   *
   * The check-then-write below still has a race window, which is why the
   * partial unique index exists in the database (see the migration). This
   * branch is what makes the ordinary case answer cleanly; the index is what
   * makes the rule true under concurrency.
   *
   * ## Version is checked here, against the server's constant
   *
   * A tab opened before a policy change would otherwise consent, in perfect
   * good faith, to a document it never displayed. Rejecting with an explicit
   * "reload the page" message is the only honest outcome — silently upgrading
   * the request to the current version would store exactly the false
   * attestation this whole design is built to avoid.
   */
  async acceptForDriver(
    towTruckId: number,
    policyVersion: string,
    context: ConsentRequestContext,
  ): Promise<PrivacyConsentStatusApi> {
    assertCurrentPolicyVersion(policyVersion)

    const existing = await this.repository.findLiveForTruck(towTruckId, PRIVACY_POLICY_VERSION)
    if (existing) {
      return {
        requiresPrivacyConsent: false,
        policyVersion: PRIVACY_POLICY_VERSION,
        acceptedAt: existing.acceptedAt.toISOString(),
      }
    }

    const created = await this.repository.create({
      towTruckId,
      policyVersion: PRIVACY_POLICY_VERSION,
      // The SERVER's hash of the SERVER's text. The DTO carries no hash at all
      // — see AcceptPrivacyConsentDto for why one from the client would be
      // worse than none.
      consentTextHash: PRIVACY_CONSENT_TEXT_HASH,
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      source: PrivacyConsentSource.EXISTING_DRIVER,
    })

    this.logger.log(`Privacy consent recorded for TowTruck #${towTruckId} (v${PRIVACY_POLICY_VERSION})`)

    return {
      requiresPrivacyConsent: false,
      policyVersion: PRIVACY_POLICY_VERSION,
      acceptedAt: created.acceptedAt.toISOString(),
    }
  }

  /**
   * Records a registration's consent, inside the caller's transaction.
   *
   * `registrationRequestId` rather than `towTruckId` because there is no truck
   * yet and there may never be one: a request can sit in the queue for days and
   * can be rejected outright. The row is re-pointed at the truck by
   * `attachToTowTruck` below if and when a moderator approves.
   *
   * `tx` is required, not optional, and that is the point of this method
   * existing separately from `acceptForDriver`: the spec's "one transaction"
   * means a registration that stored a driver but not their consent must be
   * impossible, not merely unlikely. Passing the transaction client in is what
   * makes the two writes atomic.
   */
  async acceptForRegistration(
    registrationRequestId: number,
    policyVersion: string,
    context: ConsentRequestContext,
    tx: ConsentTx,
  ): Promise<void> {
    assertCurrentPolicyVersion(policyVersion)

    await this.repository.create(
      {
        registrationRequestId,
        policyVersion: PRIVACY_POLICY_VERSION,
        consentTextHash: PRIVACY_CONSENT_TEXT_HASH,
        ipHash: context.ipHash,
        userAgent: context.userAgent,
        source: PrivacyConsentSource.REGISTRATION,
      },
      tx,
    )
  }

  /**
   * Carries a registration's consent onto the truck it became — called from
   * inside `AdminService.approve`'s transaction.
   *
   * Returns silently when there is nothing to move. That is not a swallowed
   * error: every request filed *before* this feature existed has no consent
   * row, and those requests are still in the queue and still approvable.
   * Throwing here would make them unapprovable, and the driver would then be
   * asked on their first dashboard visit anyway — which is the correct outcome
   * and the one the existing-driver flow already handles.
   */
  async attachToTowTruck(
    registrationRequestId: number,
    towTruckId: number,
    tx: ConsentTx,
  ): Promise<void> {
    await this.repository.attachRegistrationConsentToTruck(registrationRequestId, towTruckId, tx)
  }

  /**
   * Withdraws consent — «Դուք ցանկացած ժամանակ կարող եք ... դադարեցնել Ձեր էջի
   * հրապարակումը», which the consent text promises and which therefore has to
   * be reachable.
   *
   * Marks the rows withdrawn; never deletes them. The driver is then in exactly
   * the state an existing driver was in before they first consented, so the
   * dashboard blocks again on their next load — which is the honest consequence
   * of withdrawing consent to publish, not a punishment.
   *
   * Idempotent for the same reason as accepting: withdrawing twice means the
   * same thing both times, so a second call reports `revoked: 0` rather than
   * failing.
   */
  async revokeForDriver(towTruckId: number): Promise<{ revoked: number }> {
    const revoked = await this.repository.revokeAllForTruck(towTruckId, new Date())

    if (revoked > 0) {
      this.logger.log(`Privacy consent withdrawn for TowTruck #${towTruckId} (${revoked} record(s))`)
    }

    return { revoked }
  }

  /** The full history, for support and audit questions about one driver */
  async historyForDriver(towTruckId: number): Promise<PrivacyConsentHistoryEntry[]> {
    const rows = await this.repository.findAllForTruck(towTruckId)

    // Deliberately projected rather than returned raw: `ipHash`, `userAgent`
    // and `consentTextHash` are audit fields, not things a driver's own
    // dashboard has any use for, and an endpoint that returns everything the
    // row holds is how a forensic column ends up rendered in a UI.
    return rows.map((row) => ({
      policyVersion: row.policyVersion,
      acceptedAt: row.acceptedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      source: row.source,
    }))
  }

  /**
   * Nightly retention purge for withdrawn consent rows — see
   * `CONSENT_AUDIT_RETENTION_DAYS` for why the cutoff is measured from
   * `revokedAt` and why a still-live consent can never be a candidate here.
   */
  @Cron(CONSENT_AUDIT_PURGE_CRON)
  async purgeExpiredConsentHistory(): Promise<void> {
    const cutoff = new Date(Date.now() - CONSENT_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const purged = await this.repository.purgeRevokedBefore(cutoff)
    if (purged > 0) {
      this.logger.log(`Privacy consent retention: purged ${purged} withdrawn record(s) older than ${cutoff.toISOString()}`)
    }
  }
}

/**
 * The version gate, in one place because three callers need it to behave
 * identically — the dashboard acceptance, the registration acceptance, and any
 * future one.
 *
 * A `BadRequestException` and not a silent upgrade: see `acceptForDriver`.
 * The message names both versions, because the only useful thing a driver can
 * do about it is reload, and the only useful thing a developer can do about it
 * is know which two values disagreed.
 */
export function assertCurrentPolicyVersion(policyVersion: string): void {
  if (policyVersion !== PRIVACY_POLICY_VERSION) {
    throw new BadRequestException(
      `Գաղտնիության քաղաքականությունը թարմացվել է (${PRIVACY_POLICY_VERSION}). ` +
        'Թարմացրեք էջը և կրկին հաստատեք համաձայնությունը։',
    )
  }
}

/**
 * Exported for the tests and for anything that needs to fail loudly on a
 * missing truck rather than treat it as "no consent" — see the controller.
 */
export function assertTruckExists(towTruck: unknown): void {
  if (!towTruck) throw new NotFoundException('Ձեր պրոֆիլը չի գտնվել')
}

/**
 * One consent row projected the way both admin summaries show it —
 * `AdminRegistrationSummary.privacyConsent` and
 * `AdminTowTruckSummary.privacyConsent`. Pulled out here so the two mappers
 * cannot drift on what a driver's consent "looks like" from the panel: one
 * reads it off a pending `RegistrationRequest`, the other off a published
 * `TowTruck`, and this is the one place that decides which raw columns
 * survive onto the wire.
 */
export interface AdminConsentSummary {
  policyVersion: string
  acceptedAt: string
  revokedAt: string | null
}

/** `null` in, `null` out — the caller passes whatever its own query found (or nothing) */
export function toAdminConsentSummary(
  row: Pick<DriverPrivacyConsent, 'policyVersion' | 'acceptedAt' | 'revokedAt'> | null | undefined,
): AdminConsentSummary | null {
  if (!row) return null
  return {
    policyVersion: row.policyVersion,
    acceptedAt: row.acceptedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}
