import { CronExpression } from '@nestjs/schedule'

/**
 * How long a WITHDRAWN (or reassigned-away, see `attachRegistrationConsentToTruck`)
 * consent row is kept before it is purged.
 *
 * ## Why 3 years, and why "withdrawn" rather than "created"
 *
 * A consent row survives withdrawal on purpose (see
 * `PrivacyConsentRepository.revokeAllForTruck`): it is the only record able to
 * prove, later, that publication of a driver's data *was* consented to for a
 * specific period. That proof does not need to last forever — it needs to
 * outlive the ordinary window in which a dispute about that period could
 * plausibly be raised, which 3 years comfortably covers without turning the
 * table into an unbounded personal-data store.
 *
 * The clock therefore starts at `revokedAt`, not `acceptedAt`: a LIVE consent
 * (never withdrawn) is never purged by this job no matter how old it is —
 * deleting it would be deleting proof of the very thing currently being relied
 * on to keep a page published. Only a row whose story is already over — the
 * driver withdrew, or a rejected registration's consent was orphaned — starts
 * this countdown.
 *
 * ## What this does NOT delete
 *
 * A truck or registration request being deleted outright already cascades its
 * consent rows away immediately (see `schema.prisma`), which is strictly
 * FASTER erasure than this job would ever produce — so this purge only ever
 * has work to do for a driver who withdrew consent while otherwise remaining
 * in the system (see `AdminService.deleteTowTruck` for why deactivating a
 * truck and deleting one are two different, deliberately separate actions).
 */
export const CONSENT_AUDIT_RETENTION_DAYS = 365 * 3

/** When the retention purge runs — same off-peak slot as the other nightly jobs */
export const CONSENT_AUDIT_PURGE_CRON = CronExpression.EVERY_DAY_AT_4AM
