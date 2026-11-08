/**
 * Who may use the driver app — the ONLY place that decides it.
 *
 * Two kinds of app driver (see the "FleetDriver" comment in the migration):
 *
 * - SITE_LINKED: already listed on the website; an ADMIN grants access. Signs
 *   in with the website's phone + password (the TowTruck row stays the single
 *   credential — this module never stores or changes a site password).
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
export type FleetDriverStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'

export interface PasswordHasher {
  hash(password: string): Promise<string>
  compare(password: string, hash: string): Promise<boolean>
  /** A valid hash of nothing anyone knows — compared against when the account does not exist, so timing does not reveal it */
  readonly dummyHash: string
}

/**
 * The website's own credential check (DriverAuthService.login in Nest). It
 * THROWS on a wrong password or a banned profile, with the website's messages.
 */
export type SiteCredentialCheck = (phone: string, password: string) => Promise<{ towTruckId: number }>

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
  /** May receive orders right now (access ACTIVE and, for site drivers, listed) */
  isActive: boolean
  statusReason: string | null
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
  v."capacityTons", v."maxLoadTons", v."manipulator", v."wheelSkates", v."isActive",
  d."vehicleDescription", d."statusReason", d."statusChangedAt", d."createdAt"`
const VIEW_FROM = `FROM "FleetDriverProfile" v JOIN "FleetDriver" d ON d."id" = v."id"`

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
    statusReason: row.statusReason == null ? null : String(row.statusReason),
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
  }
}

async function lockPhone(tx: Sql, phone: string): Promise<void> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext('fleet-phone:' || $1::text))`, [phone])
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
   * Phone + password → FleetDriver id. The website is consulted FIRST: a
   * number listed on the site can only ever sign in with the site password.
   * Exactly one password hash comparison runs on every path.
   */
  async authenticate(phone: unknown, password: unknown, siteCheck: SiteCredentialCheck): Promise<{ driverId: number; kind: FleetDriverKind }> {
    if (typeof phone !== 'string' || typeof password !== 'string' || !APP_PHONE_PATTERN.test(phone) || password.length > 200) {
      throw new DispatchError('INVALID_CREDENTIALS')
    }
    const towTruckId = await siteTruckIdByPhone(this.db, phone)
    if (towTruckId !== null) {
      await siteCheck(phone, password) // throws the website's 401/403
      const rows = await this.db.query<Record<string, unknown>>(
        `SELECT v."id", v."status", v."isActive" FROM "FleetDriverProfile" v WHERE v."towTruckId" = $1::int`,
        [towTruckId],
      )
      const access = rows[0]
      if (!access) throw new DispatchError('APP_ACCESS_NOT_GRANTED')
      if (access.status !== 'ACTIVE') throw new DispatchError('APP_ACCESS_SUSPENDED')
      if (!access.isActive) throw new DispatchError('SITE_PROFILE_INACTIVE')
      return { driverId: toNumber(access.id), kind: 'SITE_LINKED' }
    }

    const rows = await this.db.query<{ id: number; status: FleetDriverStatus; passwordHash: string }>(
      `SELECT "id", "status", "passwordHash" FROM "FleetDriver" WHERE "kind" = 'APP_ONLY' AND "phone" = $1`,
      [phone],
    )
    const row = rows[0]
    const ok = await this.hasher.compare(password, row?.passwordHash ?? this.hasher.dummyHash)
    if (!row || !ok) throw new DispatchError('INVALID_CREDENTIALS')
    // Only reached by someone who proved the password, so the status leaks nothing.
    if (row.status === 'PENDING_REVIEW') throw new DispatchError('APP_ACCOUNT_PENDING')
    if (row.status === 'REJECTED') throw new DispatchError('APP_ACCOUNT_REJECTED')
    if (row.status === 'SUSPENDED') throw new DispatchError('APP_ACCESS_SUSPENDED')
    return { driverId: toNumber(row.id), kind: 'APP_ONLY' }
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
      ]
      if (existing[0]) {
        if (existing[0].status === 'PENDING_REVIEW') throw new DispatchError('REGISTRATION_ALREADY_PENDING')
        if (existing[0].status !== 'REJECTED') throw new DispatchError('PHONE_ALREADY_REGISTERED')
        const id = toNumber(existing[0].id)
        await tx.query(
          `UPDATE "FleetDriver" SET "status" = 'PENDING_REVIEW', "phone" = $1, "passwordHash" = $2, "driverName" = $3,
                  "vehicleType" = $4, "capacityTons" = $5::float8, "maxLoadTons" = $6::float8, "manipulator" = $7::boolean,
                  "wheelSkates" = $8::boolean, "vehicleDescription" = $9, "statusChangedAt" = now(), "statusChangedBy" = NULL,
                  "statusReason" = NULL, "updatedAt" = now()
            WHERE "id" = $10::int`,
          [...values, id],
        )
        await recordFleetEvent(tx, id, 'REGISTERED_AGAIN', null)
        return { driverId: id, status: 'PENDING_REVIEW' as const }
      }
      const [row] = await tx.query<{ id: number }>(
        `INSERT INTO "FleetDriver" ("kind", "status", "phone", "passwordHash", "driverName", "vehicleType", "capacityTons",
                                    "maxLoadTons", "manipulator", "wheelSkates", "vehicleDescription")
         VALUES ('APP_ONLY', 'PENDING_REVIEW', $1, $2, $3, $4, $5::float8, $6::float8, $7::boolean, $8::boolean, $9)
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
