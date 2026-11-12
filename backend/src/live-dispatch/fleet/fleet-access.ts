/**
 * Who may use the driver app — the ONLY place that decides it.
 *
 * Two kinds of app driver (see the "FleetDriver" comment in the migration):
 *
 * - SITE_LINKED: registered on the website; an ADMIN grants access. Signs in
 *   with the website's phone + password (the TowTruck row stays the single
 *   credential — this module never stores or changes a site password). Only
 *   the password is shared: the website status (listed, unpaid, deactivated)
 *   has no effect on the app, and app access has none on the website.
 * - APP_ONLY: registered in the app, never shown on the website. Starts
 *   PENDING_REVIEW; an ADMIN approves or rejects.
 *
 * Nothing outside this module writes "FleetDriver". Dispatch reads drivers only
 * through the "FleetDriverProfile" view, so it never branches on the kind.
 *
 * Phone uniqueness ACROSS "TowTruck" and "FleetDriver" cannot be a database
 * constraint. It is enforced here under a transaction-scoped advisory lock on
 * the phone, and login always resolves the website first — so even if the two
 * ever collide (a site registration approved for a number that already has an
 * app-only account), the site account wins and the admin console offers
 * `linkToSite` to merge them without losing order history.
 */
import { isWithinArmenia } from '../../common/armenia-bounds'
import { DispatchError } from '../platform/errors'
import { Params, toNullableDate, toNullableNumber, toNumber } from '../platform/params'
import { withRetryingTransaction, type Sql, type SqlDatabase } from '../platform/sql'

/** Keep in sync with ARMENIAN_PHONE_PATTERN in src/common/phone.ts (test asserts) */
export const APP_PHONE_PATTERN = /^\+374\d{8}$/
/** Keep in sync with PASSWORD_MIN/MAX_LENGTH in src/driver-auth/driver-password.ts (test asserts) */
export const APP_PASSWORD_MIN_LENGTH = 8
export const APP_PASSWORD_MAX_LENGTH = 72
/**
 * Keep in sync with `VehicleType` in frontend/types/enums.ts and the picker in
 * mobile/src/domain/vehicleTypes.ts (tests read both files as text).
 */
export const APP_VEHICLE_TYPES = ['flatbed', 'sliding-platform', 'manipulator', 'heavy-duty'] as const
export type AppVehicleType = (typeof APP_VEHICLE_TYPES)[number]

export type FleetDriverKind = 'SITE_LINKED' | 'APP_ONLY'
/** DELETED: the driver deleted his own app account (2026-11); personal fields cleared, order records kept */
export type FleetDriverStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED' | 'DELETED'

export interface PasswordHasher {
  hash(password: string): Promise<string>
  compare(password: string, hash: string): Promise<boolean>
  /** A valid hash of nothing anyone knows — compared against when the account does not exist, so timing does not reveal it */
  readonly dummyHash: string
}

export interface FleetDriverView {
  id: number
  kind: FleetDriverKind
  status: FleetDriverStatus
  towTruckId: number | null
  slug: string | null
  driverName: string
  phone: string
  vehicleType: string
  capacityTons: number | null
  maxLoadTons: number | null
  manipulator: boolean
  wheelSkates: boolean
  vehicleDescription: string | null
  /** May receive orders: app access ACTIVE (the website status plays no part) */
  isActive: boolean
  /** Shown on the website right now (SITE_LINKED with an active card) — informational */
  siteListed: boolean
  statusReason: string | null
  block: { reason: string | null; until: string | null; since: string | null } | null
  statusChangedAt: Date
  createdAt: Date
}

export interface RegistrationInput {
  phone: unknown
  password: unknown
  driverName: unknown
  vehicleType: unknown
  capacityTons: unknown
  maxLoadTons?: unknown
  manipulator: unknown
  wheelSkates: unknown
  vehicleDescription?: unknown
  /** Optional base (parking) location — the dispatch fallback when GPS is stale */
  baseLatitude?: unknown
  baseLongitude?: unknown
}

export interface SiteCandidate {
  towTruckId: number
  driverName: string
  phone: string
  slug: string
  isActive: boolean
  vehicleType: string
  /** Existing app access, if any */
  driverId: number | null
  accessStatus: FleetDriverStatus | null
}

const VIEW_SELECT = `
  v."id", v."kind", v."status", v."towTruckId", v."slug", v."driverName", v."phone", v."vehicleType",
  v."capacityTons", v."maxLoadTons", v."manipulator", v."wheelSkates", v."isActive", v."siteListed",
  d."vehicleDescription", d."statusReason", d."statusChangedAt", d."createdAt",
  (bp."dispatchSuspendedAt" IS NOT NULL AND (bp."dispatchSuspendedUntil" IS NULL OR bp."dispatchSuspendedUntil" > now())) AS "blocked",
  bp."dispatchSuspendedReason" AS "blockedReason", bp."dispatchSuspendedUntil" AS "blockedUntil", bp."dispatchSuspendedAt" AS "blockedAt"`
const VIEW_FROM = `FROM "FleetDriverProfile" v JOIN "FleetDriver" d ON d."id" = v."id" LEFT JOIN "DriverPresence" bp ON bp."driverId" = v."id"`

function mapView(row: Record<string, unknown>): FleetDriverView {
  return {
    id: toNumber(row.id),
    kind: row.kind as FleetDriverKind,
    status: row.status as FleetDriverStatus,
    towTruckId: toNullableNumber(row.towTruckId),
    slug: row.slug == null ? null : String(row.slug),
    driverName: String(row.driverName ?? ''),
    phone: String(row.phone ?? ''),
    vehicleType: String(row.vehicleType ?? ''),
    capacityTons: toNullableNumber(row.capacityTons),
    maxLoadTons: toNullableNumber(row.maxLoadTons),
    manipulator: Boolean(row.manipulator),
    wheelSkates: Boolean(row.wheelSkates),
    vehicleDescription: row.vehicleDescription == null ? null : String(row.vehicleDescription),
    isActive: Boolean(row.isActive),
    siteListed: Boolean(row.siteListed),
    statusReason: row.statusReason == null ? null : String(row.statusReason),
    // Blocked for orders by an operator (DriverPresence), with the reason the driver sees and the end, if any
    block: row.blocked === true
      ? { reason: row.blockedReason == null ? null : String(row.blockedReason), until: toNullableDate(row.blockedUntil)?.toISOString() ?? null, since: toNullableDate(row.blockedAt)?.toISOString() ?? null }
      : null,
    statusChangedAt: toNullableDate(row.statusChangedAt) ?? new Date(0),
    createdAt: toNullableDate(row.createdAt) ?? new Date(0),
  }
}

function invalid(field: string): DispatchError {
  return new DispatchError('VALIDATION_FAILED', { field })
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw invalid(field)
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length < min || trimmed.length > max) throw invalid(field)
  return trimmed
}

function tons(value: unknown, field: string, required: boolean): number | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw invalid(field)
    return null
  }
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0.5 || n > 80) throw invalid(field)
  return Math.round(n * 10) / 10
}

/** Pure — validated, normalised registration (exported for unit tests) */
export function parseRegistration(input: RegistrationInput) {
  if (typeof input.phone !== 'string' || !APP_PHONE_PATTERN.test(input.phone)) throw invalid('phone')
  if (typeof input.password !== 'string' || input.password.length < APP_PASSWORD_MIN_LENGTH || input.password.length > APP_PASSWORD_MAX_LENGTH) {
    throw invalid('password')
  }
  if (typeof input.vehicleType !== 'string' || !(APP_VEHICLE_TYPES as readonly string[]).includes(input.vehicleType)) throw invalid('vehicleType')
  if (typeof input.manipulator !== 'boolean') throw invalid('manipulator')
  if (typeof input.wheelSkates !== 'boolean') throw invalid('wheelSkates')
  const description =
    input.vehicleDescription === undefined || input.vehicleDescription === null || input.vehicleDescription === ''
      ? null
      : text(input.vehicleDescription, 'vehicleDescription', 1, 200)
  const base = baseLocation(input.baseLatitude, input.baseLongitude)
  return {
    phone: input.phone,
    password: input.password,
    driverName: text(input.driverName, 'driverName', 2, 80),
    vehicleType: input.vehicleType as AppVehicleType,
    capacityTons: tons(input.capacityTons, 'capacityTons', true) as number,
    maxLoadTons: tons(input.maxLoadTons, 'maxLoadTons', false),
    manipulator: input.manipulator,
    wheelSkates: input.wheelSkates,
    vehicleDescription: description,
    baseLatitude: base?.latitude ?? null,
    baseLongitude: base?.longitude ?? null,
  }
}

/** Both or neither; a real point inside Armenia, rounded to the column's 6 decimals */
function baseLocation(lat: unknown, lng: unknown): { latitude: number; longitude: number } | null {
  const absent = (v: unknown) => v === undefined || v === null || v === ''
  if (absent(lat) && absent(lng)) return null
  const latitude = typeof lat === 'number' ? lat : Number(lat)
  const longitude = typeof lng === 'number' ? lng : Number(lng)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isWithinArmenia(latitude, longitude)) throw invalid('baseLocation')
  return { latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 }
}

async function lockPhone(tx: Sql, phone: string): Promise<void> {
  // `pg_advisory_xact_lock` returns `void`, which Prisma's $queryRaw cannot
  // deserialize ("Failed to deserialize column of type 'void'", 500 on every
  // app sign-in that took this lock, 2026-11-12): select a constant instead.
  await tx.query(`SELECT 1 AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtext('fleet-phone:' || $1::text))) AS "lock"`, [phone])
}

async function siteTruckIdByPhone(sql: Sql, phone: string): Promise<number | null> {
  const rows = await sql.query<{ id: number }>(`SELECT "id" FROM "TowTruck" WHERE "phone" = $1`, [phone])
  return rows[0] ? toNumber(rows[0].id) : null
}

async function recordFleetEvent(tx: Sql, driverId: number, type: string, actorUserId: number | null, data: Record<string, unknown> = {}): Promise<void> {
  await tx.query(
    `INSERT INTO "FleetDriverEvent" ("driverId", "type", "actorUserId", "data") VALUES ($1::int, $2, $3::int, $4::jsonb)`,
    [driverId, type, actorUserId, JSON.stringify(data)],
  )
}

/**
 * Since 2026-11 an app sign-up IS a website registration: its TowTruck (name,
 * phones, photos, password, base) was created by the account the driver is
 * now deleting. App Store 5.1.1(v) / Google Play: deleting an account deletes
 * its data — so that profile goes too: taken off the site and stripped of
 * everything personal. The row itself stays (orders and the ledger point at
 * it); its photos are detached, and the nightly orphan purge deletes the files.
 * A profile that was on the website BEFORE the app (granted access) is the
 * driver's website account — managed on the website, left alone here.
 */
async function eraseAppCreatedProfile(tx: Sql, driverId: number): Promise<void> {
  const rows = await tx.query<{ towTruckId: number }>(
    `SELECT d."towTruckId" FROM "FleetDriver" d
      WHERE d."id" = $1::int AND d."towTruckId" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "RegistrationRequest" r WHERE r."approvedTowTruckId" = d."towTruckId" AND r."source" = 'APP')`,
    [driverId],
  )
  const towTruckId = rows[0] ? toNumber(rows[0].towTruckId) : null
  if (towTruckId === null) return
  await tx.query(
    `UPDATE "TowTruck"
        SET "isActive" = false, "appOnly" = false, "deactivationReason" = 'OTHER',
            "driverName" = 'Ջնջված հաշիվ', "companyName" = NULL,
            "phone" = 'deleted-' || "id"::text, "secondaryPhone" = NULL, "whatsapp" = NULL, "telegram" = NULL, "email" = NULL,
            "description" = '', "workingHoursText" = NULL,
            "latitude" = NULL, "longitude" = NULL, "locationUpdatedAt" = NULL,
            "passwordHash" = NULL, "mustChangePassword" = false,
            "telegramChatId" = NULL, "telegramLinkToken" = NULL, "telegramLinkTokenExpiresAt" = NULL,
            "updatedAt" = now()
      WHERE "id" = $1::int`,
    [towTruckId],
  )
  await tx.query(`UPDATE "TowTruckImage" SET "towTruckId" = NULL WHERE "towTruckId" = $1::int`, [towTruckId])
  await tx.query(`DELETE FROM "ProfileChangeRequest" WHERE "towTruckId" = $1::int`, [towTruckId])
  await tx.query(`DELETE FROM "SiteListingRequest" WHERE "towTruckId" = $1::int`, [towTruckId])
  await tx.query(
    `UPDATE "RegistrationRequest"
        SET "passwordHash" = NULL, "firstName" = 'Ջնջված', "lastName" = '', "companyName" = NULL, "phone" = 'deleted-' || "id"::text,
            "secondaryPhone" = NULL, "whatsapp" = NULL, "telegram" = NULL, "email" = NULL, "latitude" = NULL, "longitude" = NULL
      WHERE "approvedTowTruckId" = $1::int`,
    [towTruckId],
  )
}

/** Logs the driver out of every device: an access change must take effect now, not in 30 days */
async function revokeAllSessions(tx: Sql, driverId: number, reason: string): Promise<void> {
  const revoked = await tx.query<{ id: string }>(
    `UPDATE "DriverDeviceSession" SET "revokedAt" = now(), "revokeReason" = $2
      WHERE "driverId" = $1::int AND "revokedAt" IS NULL RETURNING "id"::text AS "id"`,
    [driverId, reason],
  )
  if (revoked.length > 0) {
    await tx.query(
      `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = 'ACCESS_CHANGED'
        WHERE "driverId" = $1::int AND "invalidatedAt" IS NULL`,
      [driverId],
    )
  }
  // Not "online" any more — so dispatch and the public search stop counting them.
  await tx.query(
    `UPDATE "DriverPresence" SET "wantsOnline" = false, "wantsOnlineChangedAt" = now(), "availableSince" = NULL, "updatedAt" = now()
      WHERE "driverId" = $1::int AND "wantsOnline"`,
    [driverId],
  )
}

export class FleetAccess {
  constructor(
    private readonly db: SqlDatabase,
    private readonly hasher: PasswordHasher,
  ) {}

  // ─── Driver side ────────────────────────────────────────────────────────

  /**
   * Phone + password → FleetDriver id. The website row is consulted FIRST: a
   * number listed on the site signs in ONLY with the site password (the same
   * `TowTruck.passwordHash`, compared here with the same bcrypt).
   *
   * Only the PASSWORD is shared with the website — never its status. Whether
   * the site currently shows the driver (unpaid, deactivated, …) does not
   * matter to the app; only this driver's app access does. That is why the
   * website's own login (DriverAuthService.login, which refuses deactivated
   * profiles) is NOT called here.
   *
   * Exactly one password hash comparison runs on every path.
   */
  async authenticate(phone: unknown, password: unknown): Promise<{ driverId: number; kind: FleetDriverKind; mustChangePassword: boolean }> {
    if (typeof phone !== 'string' || typeof password !== 'string' || !APP_PHONE_PATTERN.test(phone) || password.length > 200) {
      throw new DispatchError('INVALID_CREDENTIALS')
    }
    const site = await this.db.query<{ id: number; passwordHash: string | null; mustChangePassword: boolean }>(
      `SELECT "id", "passwordHash", "mustChangePassword" FROM "TowTruck" WHERE "phone" = $1`,
      [phone],
    )
    if (site[0]) {
      const ok = await this.hasher.compare(password, site[0].passwordHash ?? this.hasher.dummyHash)
      // Same single message as the website: never say which half was wrong,
      // nor whether this number has a password yet.
      if (!site[0].passwordHash || !ok) throw new DispatchError('INVALID_CREDENTIALS')
      const rows = await this.db.query<{ id: number; status: FleetDriverStatus }>(
        `SELECT "id", "status" FROM "FleetDriver" WHERE "towTruckId" = $1::int`,
        [site[0].id],
      )
      let access: { id: number; status: FleetDriverStatus } | undefined = rows[0]
      // Signed up IN the app and approved: access is part of what they applied
      // for, so the first sign-in grants it (see grantFromAppSignup). Only
      // when there is no row at all — a suspended or self-deleted access is a
      // decision, and is never undone by signing in.
      if (!access) access = (await this.grantFromAppSignup(toNumber(site[0].id))) ?? undefined
      // A deleted app account is "no access": an admin may grant it again.
      if (!access || access.status === 'DELETED') throw new DispatchError('APP_ACCESS_NOT_GRANTED')
      if (access.status !== 'ACTIVE') throw new DispatchError('APP_ACCESS_SUSPENDED')
      return { driverId: toNumber(access.id), kind: 'SITE_LINKED', mustChangePassword: Boolean(site[0].mustChangePassword) }
    }

    const rows = await this.db.query<{ id: number; status: FleetDriverStatus; passwordHash: string }>(
      `SELECT "id", "status", "passwordHash" FROM "FleetDriver" WHERE "kind" = 'APP_ONLY' AND "phone" = $1`,
      [phone],
    )
    const row = rows[0]
    // No app account either: perhaps an app sign-up still in the moderation
    // queue (it is a website registration now, so it has no FleetDriver row
    // until approval). Its own password is compared INSTEAD of the dummy hash —
    // still exactly one comparison on this path — and the status is told only
    // to someone who proved that password.
    const signup = row ? null : await this.latestAppSignup(phone)
    const ok = await this.hasher.compare(password, row?.passwordHash ?? signup?.passwordHash ?? this.hasher.dummyHash)
    if (!row && signup && ok) throw new DispatchError(signup.status === 'REJECTED' ? 'APP_ACCOUNT_REJECTED' : 'APP_ACCOUNT_PENDING')
    if (!row || !ok) throw new DispatchError('INVALID_CREDENTIALS')
    // Only reached by someone who proved the password, so the status leaks nothing.
    if (row.status === 'PENDING_REVIEW') throw new DispatchError('APP_ACCOUNT_PENDING')
    if (row.status === 'REJECTED') throw new DispatchError('APP_ACCOUNT_REJECTED')
    if (row.status === 'SUSPENDED') throw new DispatchError('APP_ACCESS_SUSPENDED')
    return { driverId: toNumber(row.id), kind: 'APP_ONLY', mustChangePassword: false }
  }

  /**
   * The driver deletes his own app account, from inside the app (App Store
   * 5.1.1(v), Google Play account deletion). The password is asked again —
   * deletion cannot be undone.
   *
   * Deleted at once: every device session (which logs out every device) and
   * push token, presence, the live position and the whole location history.
   * APP_ONLY: the row stays as DELETED with every personal field cleared —
   * phone, password, name, vehicle description, base location — so the phone
   * number can register again. SITE_LINKED: only app access ends; the website
   * profile is a separate account, managed on the website.
   *
   * Kept (business records, disclosed in the app's privacy policy): orders he
   * carried out, their offers and assignments, linked to the anonymised row.
   * Refused while he has an active order or a pending offer — a customer is
   * waiting on it.
   */
  async deleteOwnAccount(driverId: number, password: unknown): Promise<void> {
    if (typeof password !== 'string' || password.length === 0 || password.length > 200) throw new DispatchError('INVALID_CREDENTIALS')
    await withRetryingTransaction(this.db, async (tx) => {
      const row = await this.lockForErase(tx, driverId)
      const hash = row.kind === 'SITE_LINKED' ? row.sitePasswordHash : row.passwordHash
      const ok = await this.hasher.compare(password, hash ?? this.hasher.dummyHash)
      if (!hash || !ok) throw new DispatchError('INVALID_CREDENTIALS')
      await this.erase(tx, driverId, row.kind, null)
    })
  }

  /**
   * The same deletion, done by an ADMIN for a driver who asked without the
   * app (the web page /driver-app/delete-account promises it). The admin
   * must have verified the request; recorded with his id.
   */
  async deleteAccountOnRequest(driverId: number, adminUserId: number): Promise<FleetDriverView> {
    return withRetryingTransaction(this.db, async (tx) => {
      const row = await this.lockForErase(tx, driverId)
      await this.erase(tx, driverId, row.kind, adminUserId)
      return this.get(driverId, tx)
    })
  }

  private async lockForErase(tx: Sql, driverId: number) {
    const rows = await tx.query<{ kind: FleetDriverKind; status: FleetDriverStatus; passwordHash: string | null; sitePasswordHash: string | null }>(
      `SELECT d."kind", d."status", d."passwordHash", tt."passwordHash" AS "sitePasswordHash"
         FROM "FleetDriver" d LEFT JOIN "TowTruck" tt ON tt."id" = d."towTruckId"
        WHERE d."id" = $1::int FOR UPDATE OF d`,
      [driverId],
    )
    const row = rows[0]
    if (!row || row.status === 'DELETED') throw new DispatchError('FLEET_DRIVER_NOT_FOUND')
    const busy = await tx.query(
      `SELECT 1 FROM "OrderAssignment" WHERE "driverId" = $1::int AND "endedAt" IS NULL
       UNION ALL SELECT 1 FROM "OrderOffer" WHERE "driverId" = $1::int AND "status" = 'PENDING' LIMIT 1`,
      [driverId],
    )
    if (busy.length > 0) throw new DispatchError('ACTIVE_ORDER_IN_PROGRESS')
    return row
  }

  /** See deleteOwnAccount: what is deleted, what is cleared, what is kept */
  private async erase(tx: Sql, driverId: number, kind: FleetDriverKind, adminUserId: number | null): Promise<void> {
    // Sessions cascade to push tokens; a deleted session fails the guard,
    // so every device is signed out by this.
    await tx.query(`DELETE FROM "DriverDeviceSession" WHERE "driverId" = $1::int`, [driverId])
    await tx.query(`DELETE FROM "PushDeviceToken" WHERE "driverId" = $1::int`, [driverId])
    await tx.query(`DELETE FROM "DriverLocationHistory" WHERE "driverId" = $1::int`, [driverId])
    await tx.query(`DELETE FROM "DriverLocationCurrent" WHERE "driverId" = $1::int`, [driverId])
    await tx.query(`DELETE FROM "DriverPresence" WHERE "driverId" = $1::int`, [driverId])
    const reason = adminUserId === null ? 'DELETED_BY_DRIVER' : 'DELETED_ON_REQUEST'
    if (kind === 'APP_ONLY') {
      await tx.query(
        `UPDATE "FleetDriver" SET "status" = 'DELETED', "phone" = NULL, "passwordHash" = NULL, "driverName" = NULL,
                "vehicleDescription" = NULL, "baseLatitude" = NULL, "baseLongitude" = NULL,
                "statusChangedAt" = now(), "statusChangedBy" = $2::int, "statusReason" = $3, "updatedAt" = now()
          WHERE "id" = $1::int`,
        [driverId, adminUserId, reason],
      )
    } else {
      await tx.query(
        `UPDATE "FleetDriver" SET "status" = 'DELETED', "statusChangedAt" = now(), "statusChangedBy" = $2::int,
                "statusReason" = $3, "updatedAt" = now()
          WHERE "id" = $1::int`,
        [driverId, adminUserId, reason],
      )
      await eraseAppCreatedProfile(tx, driverId)
    }
    await recordFleetEvent(tx, driverId, adminUserId === null ? 'ACCOUNT_DELETED_BY_DRIVER' : 'ACCOUNT_DELETED_ON_REQUEST', adminUserId, { kind })
  }

  // ─── App sign-up = website registration (2026-11) ─────────────────────

  /**
   * The checks the app's sign-up needs that the website's registration
   * endpoint cannot make (it knows nothing about app accounts), then the
   * password hash it will carry. Called before `RegistrationService.submit`.
   *
   * - an app-only account on this number already exists → sign in instead;
   * - an app sign-up for it is already in the queue → wait for it.
   *
   * A number already on the website is refused by `RegistrationService` itself
   * (the same main-phone rule `/register` applies), so it is not repeated here.
   */
  async prepareSiteRegistration(phone: unknown, password: unknown): Promise<{ passwordHash: string }> {
    if (typeof phone !== 'string' || !APP_PHONE_PATTERN.test(phone)) throw invalid('phone')
    if (typeof password !== 'string' || password.length < APP_PASSWORD_MIN_LENGTH || password.length > APP_PASSWORD_MAX_LENGTH) {
      throw invalid('password')
    }
    const appOnly = await this.db.query<{ status: FleetDriverStatus }>(
      `SELECT "status" FROM "FleetDriver" WHERE "kind" = 'APP_ONLY' AND "phone" = $1`,
      [phone],
    )
    if (appOnly[0]?.status === 'PENDING_REVIEW') throw new DispatchError('REGISTRATION_ALREADY_PENDING')
    if (appOnly[0] && appOnly[0].status !== 'REJECTED' && appOnly[0].status !== 'DELETED') throw new DispatchError('PHONE_ALREADY_REGISTERED')
    const queued = await this.db.query(
      `SELECT 1 FROM "RegistrationRequest" WHERE "phone" = $1 AND "source" = 'APP' AND "status" = 'PENDING' LIMIT 1`,
      [phone],
    )
    if (queued.length > 0) throw new DispatchError('REGISTRATION_ALREADY_PENDING')
    return { passwordHash: await this.hasher.hash(password) }
  }

  /** The newest app sign-up for this number that still holds its password (pending or rejected) */
  private async latestAppSignup(phone: string): Promise<{ status: 'PENDING' | 'REJECTED'; passwordHash: string } | null> {
    const rows = await this.db.query<{ status: 'PENDING' | 'REJECTED'; passwordHash: string }>(
      `SELECT "status"::text AS "status", "passwordHash" FROM "RegistrationRequest"
        WHERE "phone" = $1 AND "source" = 'APP' AND "passwordHash" IS NOT NULL AND "status" IN ('PENDING', 'REJECTED')
        ORDER BY "createdAt" DESC LIMIT 1`,
      [phone],
    )
    return rows[0] ?? null
  }

  /**
   * First sign-in of a driver whose website profile came from an APP sign-up:
   * app access was part of the application, so it is granted here, once.
   *
   * Inside FleetAccess because nothing else writes "FleetDriver"; at sign-in
   * rather than inside AdminService.approve because the website module knows
   * nothing about app accounts, and this way the grant is one transaction with
   * its own checks instead of a second write after approval that could fail.
   * `ON CONFLICT DO NOTHING`: a grant an admin made in between wins.
   */
  private async grantFromAppSignup(towTruckId: number): Promise<{ id: number; status: FleetDriverStatus } | null> {
    return withRetryingTransaction(this.db, async (tx) => {
      const signups = await tx.query<{ id: number }>(
        `SELECT "id" FROM "RegistrationRequest" WHERE "approvedTowTruckId" = $1::int AND "source" = 'APP' AND "status" = 'APPROVED' LIMIT 1`,
        [towTruckId],
      )
      if (!signups[0]) return null
      const trucks = await tx.query<{ phone: string }>(`SELECT "phone" FROM "TowTruck" WHERE "id" = $1::int FOR SHARE`, [towTruckId])
      if (!trucks[0]) return null
      await lockPhone(tx, trucks[0].phone)
      // Same refusal as grantSiteAccess: two accounts for one number are
      // merged by an admin (linkToSite), never silently.
      const appOnly = await tx.query(`SELECT 1 FROM "FleetDriver" WHERE "kind" = 'APP_ONLY' AND "phone" = $1`, [trucks[0].phone])
      if (appOnly.length > 0) return null
      const inserted = await tx.query<{ id: number }>(
        `INSERT INTO "FleetDriver" ("kind", "status", "towTruckId") VALUES ('SITE_LINKED', 'ACTIVE', $1::int)
         ON CONFLICT ("towTruckId") DO NOTHING RETURNING "id"`,
        [towTruckId],
      )
      if (inserted[0]) {
        await recordFleetEvent(tx, toNumber(inserted[0].id), 'SITE_ACCESS_FROM_APP_SIGNUP', null, {
          towTruckId,
          registrationRequestId: toNumber(signups[0].id),
        })
      }
      const rows = await tx.query<{ id: number; status: FleetDriverStatus }>(`SELECT "id", "status" FROM "FleetDriver" WHERE "towTruckId" = $1::int`, [towTruckId])
      return rows[0] ? { id: toNumber(rows[0].id), status: rows[0].status } : null
    })
  }

  /** The website profile behind a SITE_LINKED driver, or null for an app-only one */
  async towTruckIdOf(driverId: number): Promise<number | null> {
    const rows = await this.db.query<{ towTruckId: number | null }>(`SELECT "towTruckId" FROM "FleetDriver" WHERE "id" = $1::int`, [driverId])
    return rows[0] ? toNullableNumber(rows[0].towTruckId) : null
  }

  /**
   * Self-registration from the app. Never creates anything public; the row
   * waits as PENDING_REVIEW. A previously REJECTED number may apply again
   * (the same row is reused, so its history stays in one place).
   */
  async register(input: RegistrationInput): Promise<{ driverId: number; status: 'PENDING_REVIEW' }> {
    const data = parseRegistration(input)
    const passwordHash = await this.hasher.hash(data.password)
    return withRetryingTransaction(this.db, async (tx) => {
      await lockPhone(tx, data.phone)
      if ((await siteTruckIdByPhone(tx, data.phone)) !== null) throw new DispatchError('PHONE_BELONGS_TO_SITE_DRIVER')
      const existing = await tx.query<{ id: number; status: FleetDriverStatus }>(
        `SELECT "id", "status" FROM "FleetDriver" WHERE "phone" = $1 FOR UPDATE`,
        [data.phone],
      )
      const values = [
        data.phone, passwordHash, data.driverName, data.vehicleType, data.capacityTons,
        data.maxLoadTons, data.manipulator, data.wheelSkates, data.vehicleDescription,
        data.baseLatitude, data.baseLongitude,
      ]
      if (existing[0]) {
        if (existing[0].status === 'PENDING_REVIEW') throw new DispatchError('REGISTRATION_ALREADY_PENDING')
        if (existing[0].status !== 'REJECTED') throw new DispatchError('PHONE_ALREADY_REGISTERED')
        const id = toNumber(existing[0].id)
        await tx.query(
          `UPDATE "FleetDriver" SET "status" = 'PENDING_REVIEW', "phone" = $1, "passwordHash" = $2, "driverName" = $3,
                  "vehicleType" = $4, "capacityTons" = $5::float8, "maxLoadTons" = $6::float8, "manipulator" = $7::boolean,
                  "wheelSkates" = $8::boolean, "vehicleDescription" = $9, "baseLatitude" = $10::numeric, "baseLongitude" = $11::numeric,
                  "statusChangedAt" = now(), "statusChangedBy" = NULL, "statusReason" = NULL, "updatedAt" = now()
            WHERE "id" = $12::int`,
          [...values, id],
        )
        await recordFleetEvent(tx, id, 'REGISTERED_AGAIN', null)
        return { driverId: id, status: 'PENDING_REVIEW' as const }
      }
      const [row] = await tx.query<{ id: number }>(
        `INSERT INTO "FleetDriver" ("kind", "status", "phone", "passwordHash", "driverName", "vehicleType", "capacityTons",
                                    "maxLoadTons", "manipulator", "wheelSkates", "vehicleDescription", "baseLatitude", "baseLongitude")
         VALUES ('APP_ONLY', 'PENDING_REVIEW', $1, $2, $3, $4, $5::float8, $6::float8, $7::boolean, $8::boolean, $9, $10::numeric, $11::numeric)
         RETURNING "id"`,
        values,
      )
      const id = toNumber(row.id)
      await recordFleetEvent(tx, id, 'REGISTERED', null)
      return { driverId: id, status: 'PENDING_REVIEW' as const }
    })
  }

  // ─── Admin side ─────────────────────────────────────────────────────────

  async get(driverId: number, sql: Sql = this.db): Promise<FleetDriverView> {
    const rows = await sql.query<Record<string, unknown>>(`SELECT ${VIEW_SELECT} ${VIEW_FROM} WHERE v."id" = $1::int`, [driverId])
    if (!rows[0]) throw new DispatchError('FLEET_DRIVER_NOT_FOUND')
    return mapView(rows[0])
  }

  async list(filter: { status?: FleetDriverStatus; kind?: FleetDriverKind; q?: string; limit?: number; offset?: number }): Promise<FleetDriverView[]> {
    const p = new Params()
    const where: string[] = []
    if (filter.status) where.push(`v."status" = ${p.add(filter.status)}::"FleetDriverStatus"`)
    if (filter.kind) where.push(`v."kind" = ${p.add(filter.kind)}::"FleetDriverKind"`)
    if (filter.q?.trim()) {
      const like = p.add(`%${filter.q.trim().replace(/[%_\\]/g, '\\$&')}%`)
      where.push(`(v."driverName" ILIKE ${like} OR v."phone" ILIKE ${like} OR v."slug" ILIKE ${like})`)
    }
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${VIEW_SELECT} ${VIEW_FROM}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY (v."status" = 'PENDING_REVIEW') DESC, d."createdAt" DESC
        LIMIT ${p.add(Math.min(Math.max(filter.limit ?? 50, 1), 200))}::int OFFSET ${p.add(Math.max(filter.offset ?? 0, 0))}::int`,
      p.values,
    )
    return rows.map(mapView)
  }

  /** Site profiles matching a search, with whether each already has app access — for the "grant" picker */
  async siteCandidates(q: string): Promise<SiteCandidate[]> {
    const query = q.trim()
    if (query.length < 2) return []
    const like = `%${query.replace(/[%_\\]/g, '\\$&')}%`
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT tt."id" AS "towTruckId", tt."driverName", tt."phone", tt."slug", tt."isActive", tt."vehicleType",
              d."id" AS "driverId", d."status" AS "accessStatus"
         FROM "TowTruck" tt LEFT JOIN "FleetDriver" d ON d."towTruckId" = tt."id"
        WHERE tt."driverName" ILIKE $1 OR tt."phone" ILIKE $1 OR tt."slug" ILIKE $1
        ORDER BY tt."isActive" DESC, tt."driverName"
        LIMIT 20`,
      [like],
    )
    return rows.map((r) => ({
      towTruckId: toNumber(r.towTruckId),
      driverName: String(r.driverName),
      phone: String(r.phone),
      slug: String(r.slug),
      isActive: Boolean(r.isActive),
      vehicleType: String(r.vehicleType),
      driverId: toNullableNumber(r.driverId),
      accessStatus: (r.accessStatus as FleetDriverStatus | null) ?? null,
    }))
  }

  /** Give a website driver app access (or give it back). Their site login becomes their app login. */
  async grantSiteAccess(towTruckId: number, adminUserId: number): Promise<FleetDriverView> {
    return withRetryingTransaction(this.db, async (tx) => {
      const trucks = await tx.query<{ phone: string }>(`SELECT "phone" FROM "TowTruck" WHERE "id" = $1::int FOR SHARE`, [towTruckId])
      if (!trucks[0]) throw new DispatchError('TOW_TRUCK_NOT_FOUND')
      await lockPhone(tx, trucks[0].phone)
      const appOnly = await tx.query(`SELECT 1 FROM "FleetDriver" WHERE "kind" = 'APP_ONLY' AND "phone" = $1`, [trucks[0].phone])
      if (appOnly.length > 0) throw new DispatchError('PHONE_HAS_APP_ONLY_ACCOUNT')
      const [row] = await tx.query<{ id: number; inserted: boolean }>(
        `INSERT INTO "FleetDriver" ("kind", "status", "towTruckId", "statusChangedBy")
         VALUES ('SITE_LINKED', 'ACTIVE', $1::int, $2::int)
         ON CONFLICT ("towTruckId") DO UPDATE
           SET "status" = 'ACTIVE', "statusChangedAt" = now(), "statusChangedBy" = EXCLUDED."statusChangedBy",
               "statusReason" = NULL, "updatedAt" = now()
         RETURNING "id", (xmax = 0) AS "inserted"`,
        [towTruckId, adminUserId],
      )
      const id = toNumber(row.id)
      await recordFleetEvent(tx, id, row.inserted ? 'SITE_ACCESS_GRANTED' : 'ACCESS_RESTORED', adminUserId, { towTruckId })
      return this.get(id, tx)
    })
  }

  async approve(driverId: number, adminUserId: number): Promise<FleetDriverView> {
    return withRetryingTransaction(this.db, async (tx) => {
      const row = await this.lockRow(tx, driverId)
      if (row.kind !== 'APP_ONLY' || row.status !== 'PENDING_REVIEW') throw new DispatchError('INVALID_TRANSITION', { action: 'APPROVE', status: row.status })
      await lockPhone(tx, row.phone!)
      if ((await siteTruckIdByPhone(tx, row.phone!)) !== null) throw new DispatchError('PHONE_BELONGS_TO_SITE_DRIVER')
      await this.setStatus(tx, driverId, 'ACTIVE', adminUserId, null)
      await recordFleetEvent(tx, driverId, 'APPROVED', adminUserId)
      return this.get(driverId, tx)
    })
  }

  async reject(driverId: number, reason: unknown, adminUserId: number): Promise<FleetDriverView> {
    const why = text(reason, 'reason', 2, 300)
    return withRetryingTransaction(this.db, async (tx) => {
      const row = await this.lockRow(tx, driverId)
      if (row.kind !== 'APP_ONLY' || row.status !== 'PENDING_REVIEW') throw new DispatchError('INVALID_TRANSITION', { action: 'REJECT', status: row.status })
      await this.setStatus(tx, driverId, 'REJECTED', adminUserId, why)
      await recordFleetEvent(tx, driverId, 'REJECTED', adminUserId, { reason: why })
      return this.get(driverId, tx)
    })
  }

  /**
   * Take app access away (either kind). Logs every device out at once. Refused
   * while the driver holds an order — an operator releases the order first, so
   * a customer is never left with a driver who can no longer report progress.
   * A PENDING offer needs no handling: the driver is no longer eligible, so
   * accepting it is refused and it expires on its own.
   */
  async suspend(driverId: number, reason: unknown, adminUserId: number): Promise<FleetDriverView> {
    const why = text(reason, 'reason', 2, 300)
    return withRetryingTransaction(this.db, async (tx) => {
      const row = await this.lockRow(tx, driverId)
      if (row.status !== 'ACTIVE') throw new DispatchError('INVALID_TRANSITION', { action: 'SUSPEND', status: row.status })
      const busy = await tx.query(`SELECT 1 FROM "OrderAssignment" WHERE "driverId" = $1::int AND "endedAt" IS NULL`, [driverId])
      if (busy.length > 0) throw new DispatchError('DRIVER_BUSY')
      await this.setStatus(tx, driverId, 'SUSPENDED', adminUserId, why)
      await revokeAllSessions(tx, driverId, 'ACCESS_SUSPENDED')
      await recordFleetEvent(tx, driverId, 'SUSPENDED', adminUserId, { reason: why })
      return this.get(driverId, tx)
    })
  }

  async reactivate(driverId: number, adminUserId: number): Promise<FleetDriverView> {
    return withRetryingTransaction(this.db, async (tx) => {
      const row = await this.lockRow(tx, driverId)
      if (row.status !== 'SUSPENDED') throw new DispatchError('INVALID_TRANSITION', { action: 'REACTIVATE', status: row.status })
      await this.setStatus(tx, driverId, 'ACTIVE', adminUserId, null)
      await recordFleetEvent(tx, driverId, 'ACCESS_RESTORED', adminUserId)
      return this.get(driverId, tx)
    })
  }

  /**
   * An app-only driver got a website profile (or always had one under another
   * number): make them ONE driver. The FleetDriver id — and with it every
   * offer, order and location — stays; their own credentials and vehicle data
   * are dropped in favour of the site's, and every device is logged out (they
   * now sign in with the site password).
   */
  async linkToSite(driverId: number, towTruckId: number, adminUserId: number): Promise<FleetDriverView> {
    return withRetryingTransaction(this.db, async (tx) => {
      const row = await this.lockRow(tx, driverId)
      if (row.kind !== 'APP_ONLY') throw new DispatchError('INVALID_TRANSITION', { action: 'LINK', kind: row.kind })
      const trucks = await tx.query(`SELECT 1 FROM "TowTruck" WHERE "id" = $1::int FOR SHARE`, [towTruckId])
      if (trucks.length === 0) throw new DispatchError('TOW_TRUCK_NOT_FOUND')
      const taken = await tx.query(`SELECT 1 FROM "FleetDriver" WHERE "towTruckId" = $1::int`, [towTruckId])
      if (taken.length > 0) throw new DispatchError('TOW_TRUCK_ALREADY_LINKED')
      const status: FleetDriverStatus = row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'
      await tx.query(
        `UPDATE "FleetDriver"
            SET "kind" = 'SITE_LINKED', "towTruckId" = $2::int, "status" = $3::"FleetDriverStatus",
                "phone" = NULL, "passwordHash" = NULL, "driverName" = NULL, "vehicleType" = NULL, "capacityTons" = NULL,
                "maxLoadTons" = NULL, "manipulator" = NULL, "wheelSkates" = NULL, "vehicleDescription" = NULL,
                "statusChangedAt" = now(), "statusChangedBy" = $4::int, "statusReason" = NULL, "updatedAt" = now()
          WHERE "id" = $1::int`,
        [driverId, towTruckId, status, adminUserId],
      )
      await revokeAllSessions(tx, driverId, 'LINKED_TO_SITE')
      await recordFleetEvent(tx, driverId, 'LINKED_TO_SITE', adminUserId, { towTruckId, previousStatus: row.status })
      return this.get(driverId, tx)
    })
  }

  private async lockRow(tx: Sql, driverId: number): Promise<{ kind: FleetDriverKind; status: FleetDriverStatus; phone: string | null }> {
    const rows = await tx.query<{ kind: FleetDriverKind; status: FleetDriverStatus; phone: string | null }>(
      `SELECT "kind", "status", "phone" FROM "FleetDriver" WHERE "id" = $1::int FOR UPDATE`,
      [driverId],
    )
    if (!rows[0]) throw new DispatchError('FLEET_DRIVER_NOT_FOUND')
    return rows[0]
  }

  private async setStatus(tx: Sql, driverId: number, status: FleetDriverStatus, adminUserId: number, reason: string | null): Promise<void> {
    await tx.query(
      `UPDATE "FleetDriver" SET "status" = $2::"FleetDriverStatus", "statusChangedAt" = now(), "statusChangedBy" = $3::int,
              "statusReason" = $4, "updatedAt" = now()
        WHERE "id" = $1::int`,
      [driverId, status, adminUserId, reason],
    )
  }
}
