/**
 * Driver devices, presence, heartbeats and positions.
 *
 * Every method takes the driver id from the AUTHENTICATED session (the guard
 * resolves it from the token's `sid`), never from a request body.
 */
import { DispatchError } from '../platform/errors'
import { Params, toDate, toNullableDate, toNullableNumber, toNumber } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import { withRetryingTransaction, type Sql, type SqlDatabase } from '../platform/sql'
import { computeAvailability, TRACKING_CONSENT_VERSION, type Availability } from './domain/availability'
import {
  classifyBatch,
  MAX_FIXES_PER_REQUEST,
  suspiciousJump,
  trackingPolicy,
  type FixRejection,
  type IncomingFix,
  type TrackingPolicy,
} from './domain/gps'

export interface DeviceSession {
  id: string
  driverId: number
  deviceId: string
  platform: 'ios' | 'android'
  revokedAt: Date | null
}

export interface IngestResult {
  serverTime: string
  accepted: number
  rejected: { seq: number | null; reason: FixRejection }[]
  /** Whether a fix from this request became the driver's current position */
  currentUpdated: boolean
  suspicious: boolean
  policy: TrackingPolicy
}

export interface DriverStateRow {
  /** FleetDriver.id — the identity every live-dispatch table uses */
  driverId: number
  kind: 'SITE_LINKED' | 'APP_ONLY'
  /** The public site profile, only for SITE_LINKED */
  towTruckId: number | null
  slug: string | null
  driverName: string
  phone: string
  vehicleType: string
  isActive: boolean
  dispatchSuspendedAt: Date | null
  wantsOnline: boolean
  externalBusy: boolean
  lastHeartbeatAt: Date | null
  trackingConsentVersion: number | null
  availableSince: Date | null
  latitude: number | null
  longitude: number | null
  accuracyM: number | null
  speedMps: number | null
  measuredAt: Date | null
  suspicious: boolean
  hasPendingOffer: boolean
  activeOrderId: number | null
  now: Date
}

export const DRIVER_STATE_SELECT = `
  t."id" AS "driverId", t."kind", t."towTruckId", t."slug", t."driverName", t."phone", t."vehicleType", t."isActive",
  p."dispatchSuspendedAt", COALESCE(p."wantsOnline", false) AS "wantsOnline",
  COALESCE(p."externalBusy", false) AS "externalBusy", p."lastHeartbeatAt",
  p."trackingConsentVersion", p."availableSince",
  lc."latitude", lc."longitude", lc."accuracyM", lc."speedMps", lc."measuredAt",
  COALESCE(lc."suspicious", false) AS "suspicious",
  EXISTS (SELECT 1 FROM "OrderOffer" o WHERE o."driverId" = t."id" AND o."status" = 'PENDING') AS "hasPendingOffer",
  (SELECT a."orderId" FROM "OrderAssignment" a WHERE a."driverId" = t."id" AND a."endedAt" IS NULL) AS "activeOrderId",
  now() AS "now"`

export const DRIVER_STATE_FROM = `
  FROM "FleetDriverProfile" t
  LEFT JOIN "DriverPresence" p ON p."driverId" = t."id"
  LEFT JOIN "DriverLocationCurrent" lc ON lc."driverId" = t."id"`

export function mapDriverState(row: Record<string, unknown>): DriverStateRow {
  return {
    driverId: toNumber(row.driverId),
    kind: row.kind === 'APP_ONLY' ? 'APP_ONLY' : 'SITE_LINKED',
    towTruckId: toNullableNumber(row.towTruckId),
    slug: row.slug == null ? null : String(row.slug),
    driverName: String(row.driverName),
    phone: String(row.phone),
    vehicleType: String(row.vehicleType),
    isActive: Boolean(row.isActive),
    dispatchSuspendedAt: toNullableDate(row.dispatchSuspendedAt),
    wantsOnline: Boolean(row.wantsOnline),
    externalBusy: Boolean(row.externalBusy),
    lastHeartbeatAt: toNullableDate(row.lastHeartbeatAt),
    trackingConsentVersion: toNullableNumber(row.trackingConsentVersion),
    availableSince: toNullableDate(row.availableSince),
    latitude: toNullableNumber(row.latitude),
    longitude: toNullableNumber(row.longitude),
    accuracyM: toNullableNumber(row.accuracyM),
    speedMps: toNullableNumber(row.speedMps),
    measuredAt: toNullableDate(row.measuredAt),
    suspicious: Boolean(row.suspicious),
    hasPendingOffer: Boolean(row.hasPendingOffer),
    activeOrderId: toNullableNumber(row.activeOrderId),
    now: toDate(row.now),
  }
}

export function availabilityOf(row: DriverStateRow, settings: DispatchSettings): Availability {
  return computeAvailability(
    {
      isActive: row.isActive,
      dispatchSuspendedAt: row.dispatchSuspendedAt,
      wantsOnline: row.wantsOnline,
      lastHeartbeatAt: row.lastHeartbeatAt,
      trackingConsentVersion: row.trackingConsentVersion,
      location:
        row.measuredAt && row.accuracyM !== null
          ? { measuredAt: row.measuredAt, accuracyM: row.accuracyM, suspicious: row.suspicious }
          : null,
      externalBusy: row.externalBusy,
      hasPendingOffer: row.hasPendingOffer,
      hasActiveAssignment: row.activeOrderId !== null,
    },
    row.now,
    settings,
  )
}

export class FleetRepository {
  constructor(private readonly db: SqlDatabase) {}

  // ─── Sessions ─────────────────────────────────────────────────────────────

  /**
   * Starts a new app session and revokes the previous one in the SAME
   * transaction (one tracking session per driver). Locking the presence row
   * serialises two simultaneous logins of the same driver; the partial unique
   * index is the backstop.
   */
  async createSession(input: {
    driverId: number
    deviceId: string
    platform: 'ios' | 'android'
    appVersion: string | null
  }): Promise<{ session: DeviceSession; replacedSessionIds: string[] }> {
    return withRetryingTransaction(this.db, async (tx) => {
      await tx.query(
        `INSERT INTO "DriverPresence" ("driverId") VALUES ($1::int) ON CONFLICT ("driverId") DO NOTHING`,
        [input.driverId],
      )
      await tx.query(`SELECT 1 FROM "DriverPresence" WHERE "driverId" = $1::int FOR UPDATE`, [input.driverId])
      const replaced = await tx.query<{ id: string }>(
        `UPDATE "DriverDeviceSession" SET "revokedAt" = now(), "revokeReason" = 'REPLACED'
          WHERE "driverId" = $1::int AND "revokedAt" IS NULL RETURNING "id"::text AS "id"`,
        [input.driverId],
      )
      if (replaced.length > 0) {
        await tx.query(
          `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = 'SESSION_REPLACED'
            WHERE "sessionId" = ANY($1::uuid[]) AND "invalidatedAt" IS NULL`,
          [`{${replaced.map((r) => r.id).join(',')}}`],
        )
      }
      const [row] = await tx.query<Record<string, unknown>>(
        `INSERT INTO "DriverDeviceSession" ("driverId", "deviceId", "platform", "appVersion", "lastSeenAt")
         VALUES ($1::int, $2, $3, $4, now())
         RETURNING "id"::text AS "id", "driverId", "deviceId", "platform", "revokedAt"`,
        [input.driverId, input.deviceId, input.platform, input.appVersion],
      )
      return { session: mapSession(row), replacedSessionIds: replaced.map((r) => r.id) }
    })
  }

  async findSession(sessionId: string): Promise<DeviceSession | null> {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT "id"::text AS "id", "driverId", "deviceId", "platform", "revokedAt"
         FROM "DriverDeviceSession" WHERE "id" = $1::uuid`,
      [sessionId],
    )
    return rows[0] ? mapSession(rows[0]) : null
  }

  /** Cheap: writes at most once a minute per session */
  async touchSession(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE "DriverDeviceSession" SET "lastSeenAt" = now()
        WHERE "id" = $1::uuid AND ("lastSeenAt" IS NULL OR "lastSeenAt" < now() - interval '60 seconds')`,
      [sessionId],
    )
  }

  /**
   * Logout / admin revoke. Push tokens of the session are invalidated; the
   * driver stops receiving offers. An ACTIVE ORDER IS NOT TOUCHED — logging
   * out is not cancelling.
   */
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await withRetryingTransaction(this.db, async (tx) => {
      const rows = await tx.query<{ driverId: number }>(
        `UPDATE "DriverDeviceSession" SET "revokedAt" = now(), "revokeReason" = $2
          WHERE "id" = $1::uuid AND "revokedAt" IS NULL RETURNING "driverId"`,
        [sessionId, reason],
      )
      await tx.query(
        `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = 'SESSION_REVOKED'
          WHERE "sessionId" = $1::uuid AND "invalidatedAt" IS NULL`,
        [sessionId],
      )
      if (rows[0]) {
        await tx.query(
          `UPDATE "DriverPresence" SET "wantsOnline" = false, "wantsOnlineChangedAt" = now(), "updatedAt" = now()
            WHERE "driverId" = $1::int`,
          [rows[0].driverId],
        )
      }
    })
  }

  async registerPushToken(sessionId: string, driverId: number, token: string): Promise<void> {
    if (token.length < 20 || token.length > 4096) throw new DispatchError('VALIDATION_FAILED', { field: 'token' })
    await withRetryingTransaction(this.db, async (tx) => {
      await this.assertActiveSession(tx, sessionId, driverId)
      // Same token bound elsewhere (reinstall, account switch on one phone):
      // only one live binding may exist.
      await tx.query(
        `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = 'REBOUND'
          WHERE "token" = $1 AND "invalidatedAt" IS NULL AND "sessionId" <> $2::uuid`,
        [token, sessionId],
      )
      await tx.query(
        `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = 'REPLACED_BY_NEWER_TOKEN'
          WHERE "sessionId" = $1::uuid AND "token" <> $2 AND "invalidatedAt" IS NULL`,
        [sessionId, token],
      )
      await tx.query(
        `INSERT INTO "PushDeviceToken" ("sessionId", "driverId", "token")
         SELECT $1::uuid, $2::int, $3
          WHERE NOT EXISTS (SELECT 1 FROM "PushDeviceToken" WHERE "token" = $3 AND "sessionId" = $1::uuid AND "invalidatedAt" IS NULL)`,
        [sessionId, driverId, token],
      )
    })
  }

  async invalidatePushToken(token: string, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE "PushDeviceToken" SET "invalidatedAt" = now(), "invalidReason" = $2 WHERE "token" = $1 AND "invalidatedAt" IS NULL`,
      [token, reason],
    )
  }

  /** Locks the session row FOR SHARE: a concurrent revoke waits until this transaction ends */
  private async assertActiveSession(tx: Sql, sessionId: string, driverId: number): Promise<void> {
    const rows = await tx.query(
      `SELECT 1 FROM "DriverDeviceSession"
        WHERE "id" = $1::uuid AND "driverId" = $2::int AND "revokedAt" IS NULL FOR SHARE`,
      [sessionId, driverId],
    )
    if (rows.length === 0) throw new DispatchError('SESSION_REVOKED')
  }

  // ─── Presence ─────────────────────────────────────────────────────────────

  async recordTrackingConsent(driverId: number, version: number): Promise<void> {
    if (version !== TRACKING_CONSENT_VERSION) throw new DispatchError('VALIDATION_FAILED', { field: 'version' })
    await this.db.query(
      `INSERT INTO "DriverPresence" ("driverId", "trackingConsentVersion", "trackingConsentAt")
       VALUES ($1::int, $2::int, now())
       ON CONFLICT ("driverId") DO UPDATE SET "trackingConsentVersion" = EXCLUDED."trackingConsentVersion",
         "trackingConsentAt" = now(), "updatedAt" = now()`,
      [driverId, version],
    )
  }

  /**
   * The driver's own switches. Going offline during an active order only
   * stops NEW offers; the order itself is untouched.
   */
  async setAvailability(
    driverId: number,
    sessionId: string,
    change: { wantsOnline?: boolean; externalBusy?: boolean },
  ): Promise<void> {
    await withRetryingTransaction(this.db, async (tx) => {
      await this.assertActiveSession(tx, sessionId, driverId)
      await tx.query(
        `INSERT INTO "DriverPresence" ("driverId") VALUES ($1::int) ON CONFLICT ("driverId") DO NOTHING`,
        [driverId],
      )
      const [presence] = await tx.query<{ trackingConsentVersion: number | null }>(
        `SELECT "trackingConsentVersion" FROM "DriverPresence" WHERE "driverId" = $1::int FOR UPDATE`,
        [driverId],
      )
      if (change.wantsOnline === true && (presence.trackingConsentVersion ?? 0) < TRACKING_CONSENT_VERSION) {
        throw new DispatchError('TRACKING_CONSENT_REQUIRED')
      }
      const p = new Params()
      const wants = p.add(change.wantsOnline ?? null)
      const busy = p.add(change.externalBusy ?? null)
      const newWants = `COALESCE(${wants}::boolean, "wantsOnline")`
      const newBusy = `COALESCE(${busy}::boolean, "externalBusy")`
      // availableSince = when the driver last BECAME free-and-willing; it is
      // the fair-queue tie-breaker for near-equal ETAs.
      const sets = [
        `"availableSince" = CASE WHEN ${newWants} AND NOT ${newBusy} AND NOT ("wantsOnline" AND NOT "externalBusy")
                                 THEN now() ELSE "availableSince" END`,
        `"wantsOnlineChangedAt" = CASE WHEN "wantsOnline" <> ${newWants} THEN now() ELSE "wantsOnlineChangedAt" END`,
        `"externalBusyChangedAt" = CASE WHEN "externalBusy" <> ${newBusy} THEN now() ELSE "externalBusyChangedAt" END`,
        `"wantsOnline" = ${newWants}`,
        `"externalBusy" = ${newBusy}`,
        `"updatedAt" = now()`,
      ]
      await tx.query(`UPDATE "DriverPresence" SET ${sets.join(', ')} WHERE "driverId" = ${p.add(driverId)}::int`, p.values)
    })
  }

  async heartbeat(driverId: number, sessionId: string): Promise<{ serverTime: string }> {
    return withRetryingTransaction(this.db, async (tx) => {
      await this.assertActiveSession(tx, sessionId, driverId)
      const [row] = await tx.query<{ now: Date }>(
        `INSERT INTO "DriverPresence" ("driverId", "lastHeartbeatAt", "heartbeatSessionId")
         VALUES ($1::int, now(), $2::uuid)
         ON CONFLICT ("driverId") DO UPDATE SET "lastHeartbeatAt" = now(), "heartbeatSessionId" = $2::uuid
         RETURNING now() AS "now"`,
        [driverId, sessionId],
      )
      return { serverTime: toDate(row.now).toISOString() }
    })
  }

  // ─── Location ─────────────────────────────────────────────────────────────

  async ingestLocations(
    driverId: number,
    sessionId: string,
    fixes: IncomingFix[],
    settings: DispatchSettings,
  ): Promise<IngestResult> {
    if (!Array.isArray(fixes) || fixes.length === 0 || fixes.length > MAX_FIXES_PER_REQUEST) {
      throw new DispatchError('VALIDATION_FAILED', { field: 'fixes', max: MAX_FIXES_PER_REQUEST })
    }
    return withRetryingTransaction(this.db, async (tx) => {
      await this.assertActiveSession(tx, sessionId, driverId)
      const [{ now }] = await tx.query<{ now: Date }>(`SELECT now() AS "now"`)
      const receivedAt = toDate(now)
      const batch = classifyBatch(fixes, receivedAt, settings)

      const [context] = await tx.query<{ orderId: number | null }>(
        `SELECT (SELECT a."orderId" FROM "OrderAssignment" a WHERE a."driverId" = $1::int AND a."endedAt" IS NULL) AS "orderId"`,
        [driverId],
      )

      let currentUpdated = false
      let suspicious = false
      if (batch.currentCandidate) {
        const candidate = batch.currentCandidate
        const stored = await tx.query<Record<string, unknown>>(
          `SELECT "sessionId"::text AS "sessionId", "seq", "latitude", "longitude", "accuracyM", "measuredAt"
             FROM "DriverLocationCurrent" WHERE "driverId" = $1::int FOR UPDATE`,
          [driverId],
        )
        const previous = stored[0]
          ? {
              latitude: toNumber(stored[0].latitude),
              longitude: toNumber(stored[0].longitude),
              accuracyM: toNumber(stored[0].accuracyM),
              measuredAt: toDate(stored[0].measuredAt),
            }
          : null
        const reason = suspiciousJump(previous, candidate, settings.gpsSuspiciousSpeedMps)
        suspicious = reason !== null

        // The WHERE clause is the real ordering rule, evaluated by Postgres on
        // the locked row: a fix replaces the stored one only if it comes from
        // a newer session (the old one is revoked, see assertActiveSession) or
        // is later in the same session by BOTH sequence and measurement time.
        const updated = await tx.query(
          `INSERT INTO "DriverLocationCurrent" ("driverId", "sessionId", "seq", "latitude", "longitude",
              "accuracyM", "speedMps", "headingDeg", "measuredAt", "receivedAt", "suspicious", "suspiciousReason")
           VALUES ($1::int, $2::uuid, $3::bigint, $4::numeric, $5::numeric, $6::real, $7::real, $8::real,
              $9::timestamptz, $10::timestamptz, $11::boolean, $12)
           ON CONFLICT ("driverId") DO UPDATE SET
              "sessionId" = EXCLUDED."sessionId", "seq" = EXCLUDED."seq",
              "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude",
              "accuracyM" = EXCLUDED."accuracyM", "speedMps" = EXCLUDED."speedMps", "headingDeg" = EXCLUDED."headingDeg",
              "measuredAt" = EXCLUDED."measuredAt", "receivedAt" = EXCLUDED."receivedAt",
              "suspicious" = EXCLUDED."suspicious", "suspiciousReason" = EXCLUDED."suspiciousReason"
            WHERE "DriverLocationCurrent"."sessionId" <> EXCLUDED."sessionId"
               OR (EXCLUDED."seq" > "DriverLocationCurrent"."seq"
                   AND EXCLUDED."measuredAt" >= "DriverLocationCurrent"."measuredAt")
           RETURNING 1`,
          [
            driverId,
            sessionId,
            candidate.seq,
            candidate.latitude,
            candidate.longitude,
            candidate.accuracyM,
            candidate.speedMps,
            candidate.headingDeg,
            candidate.measuredAt,
            receivedAt,
            suspicious,
            reason,
          ],
        )
        currentUpdated = updated.length > 0
      }

      if (batch.accepted.length > 0) {
        const p = new Params()
        const tuples = batch.accepted.map((fix) => {
          const isCurrent = batch.currentCandidate?.seq === fix.seq
          return `(${p.add(driverId)}::int, ${p.add(sessionId)}::uuid, ${p.add(fix.seq)}::bigint,
            ${p.add(fix.latitude)}::numeric, ${p.add(fix.longitude)}::numeric, ${p.add(fix.accuracyM)}::real,
            ${p.add(fix.speedMps)}::real, ${p.add(fix.headingDeg)}::real, ${p.add(fix.measuredAt)}::timestamptz,
            ${p.add(receivedAt)}::timestamptz, ${p.add(context.orderId)}::int, ${p.add(fix.late)}::boolean,
            ${p.add(isCurrent && suspicious)}::boolean)`
        })
        await tx.query(
          `INSERT INTO "DriverLocationHistory" ("driverId", "sessionId", "seq", "latitude", "longitude", "accuracyM",
             "speedMps", "headingDeg", "measuredAt", "receivedAt", "orderId", "late", "suspicious")
           VALUES ${tuples.join(', ')}
           ON CONFLICT ("sessionId", "seq") DO NOTHING`,
          p.values,
        )
      }

      const [presence] = await tx.query<{ wantsOnline: boolean | null }>(
        `SELECT "wantsOnline" FROM "DriverPresence" WHERE "driverId" = $1::int`,
        [driverId],
      )
      return {
        serverTime: receivedAt.toISOString(),
        accepted: batch.accepted.length,
        rejected: batch.rejected,
        currentUpdated,
        suspicious,
        policy: trackingPolicy({
          wantsOnline: Boolean(presence?.wantsOnline),
          hasActiveOrder: context.orderId !== null,
          lastSpeedMps: batch.currentCandidate?.speedMps ?? null,
        }),
      }
    })
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async driverState(driverId: number, sql: Sql = this.db): Promise<DriverStateRow | null> {
    const rows = await sql.query<Record<string, unknown>>(
      `SELECT ${DRIVER_STATE_SELECT} ${DRIVER_STATE_FROM} WHERE t."id" = $1::int`,
      [driverId],
    )
    return rows[0] ? mapDriverState(rows[0]) : null
  }

  /**
   * The admin map. Only drivers who have ever used the app (a presence row)
   * are listed — 400 registered drivers do not all belong on a live map.
   * Optional bounding box keeps the payload proportional to the viewport.
   */
  async listForMap(filter: {
    bbox?: { minLat: number; minLng: number; maxLat: number; maxLng: number }
    onlyWantsOnline?: boolean
    limit: number
    offset: number
  }): Promise<DriverStateRow[]> {
    const p = new Params()
    const where: string[] = ['p."driverId" IS NOT NULL']
    if (filter.onlyWantsOnline) where.push('p."wantsOnline"')
    if (filter.bbox) {
      where.push(
        `lc."latitude" BETWEEN ${p.add(filter.bbox.minLat)}::numeric AND ${p.add(filter.bbox.maxLat)}::numeric`,
        `lc."longitude" BETWEEN ${p.add(filter.bbox.minLng)}::numeric AND ${p.add(filter.bbox.maxLng)}::numeric`,
      )
    }
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${DRIVER_STATE_SELECT} ${DRIVER_STATE_FROM}
        WHERE ${where.join(' AND ')}
        ORDER BY t."id"
        LIMIT ${p.add(Math.min(filter.limit, 500))}::int OFFSET ${p.add(filter.offset)}::int`,
      p.values,
    )
    return rows.map(mapDriverState)
  }

  async setDispatchSuspended(driverId: number, suspended: boolean, reason: string | null, adminUserId: number): Promise<void> {
    await this.db.query(
      `INSERT INTO "DriverPresence" ("driverId") VALUES ($1::int) ON CONFLICT ("driverId") DO NOTHING`,
      [driverId],
    )
    await this.db.query(
      `UPDATE "DriverPresence"
          SET "dispatchSuspendedAt" = CASE WHEN $2::boolean THEN now() ELSE NULL END,
              "dispatchSuspendedReason" = CASE WHEN $2::boolean THEN $3 ELSE NULL END,
              "dispatchSuspendedBy" = CASE WHEN $2::boolean THEN $4::int ELSE NULL END,
              "updatedAt" = now()
        WHERE "driverId" = $1::int`,
      [driverId, suspended, reason, adminUserId],
    )
  }

  /** Retention: deletes history older than the configured window, in bounded chunks */
  async purgeLocationHistory(retentionDays: number, chunk = 5000): Promise<number> {
    let total = 0
    for (;;) {
      const rows = await this.db.query(
        `DELETE FROM "DriverLocationHistory" WHERE "id" IN (
           SELECT "id" FROM "DriverLocationHistory"
            WHERE "receivedAt" < now() - make_interval(days => $1::int) LIMIT $2::int)
         RETURNING 1`,
        [retentionDays, chunk],
      )
      total += rows.length
      if (rows.length < chunk) return total
    }
  }
}

function mapSession(row: Record<string, unknown>): DeviceSession {
  return {
    id: String(row.id),
    driverId: toNumber(row.driverId),
    deviceId: String(row.deviceId),
    platform: row.platform as 'ios' | 'android',
    revokedAt: toNullableDate(row.revokedAt),
  }
}
