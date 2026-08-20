import { Injectable } from '@nestjs/common'
import type { DriverPrivacyConsent, Prisma, PrismaClient } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/**
 * A Prisma transaction client, for the calls that must run inside somebody
 * else's transaction — registration writes the request and its consent
 * together, and approval re-points that consent onto the truck it creates in
 * the same breath. Both are "one act, one transaction" and neither may half
 * happen.
 */
export type ConsentTx = Prisma.TransactionClient | PrismaClient

@Injectable()
export class PrivacyConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The live consent for a truck at a given version, or null.
   *
   * `revokedAt: null` is the whole definition of "live": a withdrawn row stays
   * in the table forever as history, but stops answering this question, so a
   * driver who withdrew is asked again exactly as if they had never consented.
   *
   * `policyVersion` is matched exactly. That literal match is the re-consent
   * mechanism — bumping `PRIVACY_POLICY_VERSION` to '1.2' makes every stored
   * '1.1' invisible here, with no migration and nothing deleted.
   */
  findLiveForTruck(towTruckId: number, policyVersion: string): Promise<DriverPrivacyConsent | null> {
    return this.prisma.driverPrivacyConsent.findFirst({
      where: { towTruckId, policyVersion, revokedAt: null },
      orderBy: { acceptedAt: 'desc' },
    })
  }

  /** The whole history for one truck, newest first — for an audit or a support question */
  findAllForTruck(towTruckId: number): Promise<DriverPrivacyConsent[]> {
    return this.prisma.driverPrivacyConsent.findMany({
      where: { towTruckId },
      orderBy: { acceptedAt: 'desc' },
    })
  }

  /**
   * Records one acceptance.
   *
   * `tx` is optional and defaults to the ordinary client, so the same method
   * serves both the standalone dashboard acceptance and the one that has to
   * ride inside `RegistrationRepository.create`'s transaction. One method
   * rather than two, because two would eventually disagree about which columns
   * a consent row has.
   */
  create(data: Prisma.DriverPrivacyConsentUncheckedCreateInput, tx?: ConsentTx): Promise<DriverPrivacyConsent> {
    return (tx ?? this.prisma).driverPrivacyConsent.create({ data })
  }

  /**
   * Marks every live consent for a truck as withdrawn, and reports how many
   * rows that was.
   *
   * `updateMany`, not `update`: the partial unique index makes "more than one
   * live row" impossible, but a withdrawal that threw `RecordNotFound` when
   * there was nothing to withdraw would make the endpoint non-idempotent for no
   * benefit — a driver pressing withdraw twice means the same thing both times.
   * The count is what lets the service tell the caller whether anything
   * actually changed without a second query.
   *
   * Deliberately an UPDATE and never a DELETE. Erasing the acceptance would
   * destroy the record of the period during which publication *was* consented
   * to, which is exactly the fact this table exists to be able to show.
   */
  async revokeAllForTruck(towTruckId: number, revokedAt: Date): Promise<number> {
    const { count } = await this.prisma.driverPrivacyConsent.updateMany({
      where: { towTruckId, revokedAt: null },
      data: { revokedAt },
    })
    return count
  }

  /**
   * Moves a registration's consent onto the truck that request became.
   *
   * Called from inside `AdminService.approve`'s transaction. The row is the
   * same row — `acceptedAt` still says when the driver actually ticked the box,
   * not when a moderator got round to reviewing them, which is the only honest
   * answer and the one an audit would ask for.
   *
   * `registrationRequestId` is cleared in the same write because the check
   * constraint allows exactly one owner (see the migration): a row pointing at
   * both would count as consent twice for what was one act.
   */
  async attachRegistrationConsentToTruck(
    registrationRequestId: number,
    towTruckId: number,
    tx: ConsentTx,
  ): Promise<number> {
    const { count } = await tx.driverPrivacyConsent.updateMany({
      where: { registrationRequestId },
      data: { registrationRequestId: null, towTruckId },
    })
    return count
  }

  /**
   * Deletes withdrawn consent rows whose retention window has passed.
   *
   * Scoped to `revokedAt`, never `acceptedAt` — see
   * `CONSENT_AUDIT_RETENTION_DAYS` for why a still-live consent must never be a
   * candidate here, no matter its age.
   */
  async purgeRevokedBefore(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.driverPrivacyConsent.deleteMany({
      where: { revokedAt: { lt: cutoff } },
    })
    return count
  }
}
