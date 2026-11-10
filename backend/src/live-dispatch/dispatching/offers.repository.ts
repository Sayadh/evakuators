/**
 * Offers, attempts and candidates — every write that decides WHO gets a job.
 *
 * ## Locking discipline (the whole correctness argument)
 *
 * 1. Every operation locks the ORDER row first (`lockOrder`), then the offer
 *    row. Same order everywhere → no deadlock between accept, expire, reject,
 *    cancel and the engine; and every decision about an order is serialised.
 * 2. Cross-order conflicts (one driver, two orders) are decided by the partial
 *    unique indexes — `OrderOffer_one_pending_per_driver` and
 *    `OrderAssignment_one_active_per_driver` — not by application checks.
 *    A check that "the driver is free" is a courtesy for a clean error; the
 *    index is what makes a double booking impossible.
 * 3. Deadlines are compared with the DATABASE clock (`now()`), inside the
 *    transaction holding the lock. No process clock, no setTimeout, no Redis.
 */
import { MANUAL_OVERRIDABLE } from '../fleet/domain/availability'
import { availabilityOf, DRIVER_STATE_FROM, DRIVER_STATE_SELECT, mapDriverState } from '../fleet/fleet.repository'
import { capabilityMismatches } from '../orders/domain/requirements'
import { planTransition, SEARCH_ATTENTION_KINDS, type AttentionKind } from '../orders/domain/order-state'
import { lockOrder, requirementsOf, snapshotOf, type OrderRow } from '../orders/order-row'
import { enqueue, enqueueRealtime } from '../notify/outbox'
import { raiseAlert, recordEvent, SYSTEM, type ActorRef } from '../platform/audit'
import { DispatchError, refuse, type Refusal } from '../platform/errors'
import { Params, toDate, toNullableDate, toNullableNumber, toNumber } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import { isUniqueViolation, pgArray, SqlError, withRetryingTransaction, type Sql, type SqlDatabase } from '../platform/sql'
import { availabilityPredicate, capabilityPredicate, eligibleFrom, type LocationSource } from './eligibility-sql'
import type { Ranked } from './domain/ranking'
import type { RouteEntry } from '../routing/routing-provider'


/**
 * Row lock on the driver's ACCESS record. "FleetDriverProfile" is a join view
 * and cannot be locked itself; locking the base row is what makes an admin's
 * suspend/revoke (an UPDATE of this row) and an accept/offer strictly ordered.
 */
async function lockFleetDriver(tx: Sql, driverId: number): Promise<void> {
  await tx.query(`SELECT 1 FROM "FleetDriver" WHERE "id" = $1::int FOR SHARE`, [driverId])
}

export interface AttemptRow {
  id: number
  orderId: number
  number: number
  mode: 'AUTO' | 'MANUAL'
  maxOffers: number
  offersMade: number
  searchStage: number
  startedAt: Date
  alertAt: Date
  deadlineAt: Date
  endedAt: Date | null
  /** Evaluated by the database inside the same statement */
  deadlinePassed: boolean
}

export interface OfferRow {
  id: string
  orderId: number
  attemptId: number
  driverId: number
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED'
  manual: boolean
  termsVersion: number
  createdAt: Date
  expiresAt: Date
  respondedAt: Date | null
  roadMeters: number | null
  etaSeconds: number | null
  straightLineMeters: number | null
  routeComputedAt: Date | null
  closeReason: string | null
  /** DB clock: is the deadline still ahead? */
  beforeDeadline: boolean
}

export type NextOfferResult =
  | { kind: 'offered'; offerId: string; driverId: number }
  | { kind: 'has-pending' }
  | { kind: 'idle'; reason: string }
  | { kind: 'need-candidates'; attemptId: number; searchStage: number }
  | { kind: 'need-refresh'; attemptId: number }
  | { kind: 'failed'; attentionKind: AttentionKind }

export type AcceptResult = { ok: true; orderId: number; status: string; replayed: boolean } | Refusal

const ATTEMPT_COLUMNS = `"id", "orderId", "number", "mode", "maxOffers", "offersMade", "searchStage",
  "startedAt", "alertAt", "deadlineAt", "endedAt", (now() >= "deadlineAt") AS "deadlinePassed"`

const OFFER_COLUMNS = `"id"::text AS "id", "orderId", "attemptId", "driverId", "status", "manual", "termsVersion",
  "createdAt", "expiresAt", "respondedAt", "roadMeters", "etaSeconds", "straightLineMeters", "routeComputedAt",
  "closeReason", (now() < "expiresAt") AS "beforeDeadline"`

function mapAttempt(row: Record<string, unknown>): AttemptRow {
  return {
    id: toNumber(row.id),
    orderId: toNumber(row.orderId),
    number: toNumber(row.number),
    mode: row.mode as AttemptRow['mode'],
    maxOffers: toNumber(row.maxOffers),
    offersMade: toNumber(row.offersMade),
    searchStage: toNumber(row.searchStage),
    startedAt: toDate(row.startedAt),
    alertAt: toDate(row.alertAt),
    deadlineAt: toDate(row.deadlineAt),
    endedAt: toNullableDate(row.endedAt),
    deadlinePassed: Boolean(row.deadlinePassed),
  }
}

export function mapOffer(row: Record<string, unknown>): OfferRow {
  return {
    id: String(row.id),
    orderId: toNumber(row.orderId),
    attemptId: toNumber(row.attemptId),
    driverId: toNumber(row.driverId),
    status: row.status as OfferRow['status'],
    manual: Boolean(row.manual),
    termsVersion: toNumber(row.termsVersion),
    createdAt: toDate(row.createdAt),
    expiresAt: toDate(row.expiresAt),
    respondedAt: toNullableDate(row.respondedAt),
    roadMeters: toNullableNumber(row.roadMeters),
    etaSeconds: toNullableNumber(row.etaSeconds),
    straightLineMeters: toNullableNumber(row.straightLineMeters),
    routeComputedAt: toNullableDate(row.routeComputedAt),
    closeReason: row.closeReason === null || row.closeReason === undefined ? null : String(row.closeReason),
    beforeDeadline: Boolean(row.beforeDeadline),
  }
}

export async function openAttempt(tx: Sql, orderId: number, lock: boolean): Promise<AttemptRow | null> {
  const rows = await tx.query<Record<string, unknown>>(
    `SELECT ${ATTEMPT_COLUMNS} FROM "DispatchAttempt" WHERE "orderId" = $1::int AND "endedAt" IS NULL ${lock ? 'FOR UPDATE' : ''}`,
    [orderId],
  )
  return rows[0] ? mapAttempt(rows[0]) : null
}

async function lockOffer(tx: Sql, offerId: string): Promise<OfferRow> {
  const rows = await tx.query<Record<string, unknown>>(`SELECT ${OFFER_COLUMNS} FROM "OrderOffer" WHERE "id" = $1::uuid FOR UPDATE`, [offerId])
  if (!rows[0]) throw new DispatchError('OFFER_NOT_FOUND')
  return mapOffer(rows[0])
}

/** orderId is immutable on an offer, so reading it without a lock is safe */
async function orderIdOfOffer(db: Sql, offerId: string): Promise<{ orderId: number; driverId: number } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return null
  const rows = await db.query<{ orderId: number; driverId: number }>(
    `SELECT "orderId", "driverId" FROM "OrderOffer" WHERE "id" = $1::uuid`,
    [offerId],
  )
  return rows[0] ?? null
}

export async function bumpOrder(tx: Sql, orderId: number, sets: string[], p: Params): Promise<void> {
  await tx.query(
    `UPDATE "DispatchOrder" SET ${[...sets, '"version" = "version" + 1', '"updatedAt" = now()'].join(', ')}
      WHERE "id" = ${p.add(orderId)}::int`,
    p.values,
  )
}

export async function notifyOrderChanged(tx: Sql, order: OrderRow, reason: string, extraDrivers: number[] = []): Promise<void> {
  const [{ version }] = await tx.query<{ version: number }>(`SELECT "version" FROM "DispatchOrder" WHERE "id" = $1::int`, [order.id])
  const drivers = new Set<number>(extraDrivers)
  const [assigned] = await tx.query<{ driverId: number | null }>(
    `SELECT a."driverId" FROM "DispatchOrder" o LEFT JOIN "OrderAssignment" a ON a."id" = o."activeAssignmentId" WHERE o."id" = $1::int`,
    [order.id],
  )
  if (assigned?.driverId) drivers.add(assigned.driverId)
  await enqueueRealtime(
    tx,
    `order:${order.id}:v${version}`,
    ['admin', ...[...drivers].map((id) => `driver:${id}`)],
    'order.changed',
    { orderId: order.id, version: Number(version), reason },
  )
}

/** Revokes the live offer of an order (if any). Caller holds the order lock. */
export async function revokePendingOffer(tx: Sql, orderId: number, reason: string, actor: ActorRef): Promise<OfferRow | null> {
  const rows = await tx.query<Record<string, unknown>>(
    `UPDATE "OrderOffer" SET "status" = 'REVOKED', "respondedAt" = now(), "closeReason" = $2
      WHERE "orderId" = $1::int AND "status" = 'PENDING'
      RETURNING ${OFFER_COLUMNS}`,
    [orderId, reason],
  )
  if (!rows[0]) return null
  const offer = mapOffer(rows[0])
  await recordEvent(tx, orderId, 'OFFER_REVOKED', actor, { offerId: offer.id, driverId: offer.driverId, reason })
  await enqueueRealtime(tx, `offer:${offer.id}:closed`, [`driver:${offer.driverId}`, 'admin'], 'offer.closed', {
    offerId: offer.id,
    status: 'REVOKED',
    reason,
  })
  return offer
}

export class OffersRepository {
  constructor(private readonly db: SqlDatabase) {}

  // ─── Engine steps ─────────────────────────────────────────────────────────

  /**
   * One sequential-dispatch step: offer the order to the best still-eligible
   * candidate, or say what the engine must do first. Idempotent — calling it
   * while an offer is pending is a no-op.
   */
  async tryCreateNextOffer(orderId: number, settings: DispatchSettings): Promise<NextOfferResult> {
    return withRetryingTransaction(this.db, async (tx) => {
      const order = await lockOrder(tx, orderId)
      if (order.status !== 'SEARCHING') return { kind: 'idle', reason: `status ${order.status}` }
      const attempt = await openAttempt(tx, orderId, true)
      if (!attempt) return { kind: 'idle', reason: 'no open attempt' }
      if (attempt.mode === 'MANUAL') return { kind: 'idle', reason: 'manual attempt' }

      const pending = await tx.query(`SELECT 1 FROM "OrderOffer" WHERE "orderId" = $1::int AND "status" = 'PENDING'`, [orderId])
      if (pending.length > 0) return { kind: 'has-pending' }

      if (attempt.deadlinePassed) {
        await this.failSearch(tx, order, attempt, 'SEARCH_TIMEOUT')
        return { kind: 'failed', attentionKind: 'SEARCH_TIMEOUT' }
      }
      if (attempt.offersMade >= attempt.maxOffers) {
        await this.failSearch(tx, order, attempt, 'SEARCH_EXHAUSTED')
        return { kind: 'failed', attentionKind: 'SEARCH_EXHAUSTED' }
      }

      const queued = await tx.query<Record<string, unknown>>(
        `SELECT "id", "driverId", "roadMeters", "etaSeconds", "routeOk", "straightLineMeters", "routedAt", "locationSource",
                ("routedAt" IS NOT NULL AND "routedAt" < now() - make_interval(secs => $2::int)) AS "stale"
           FROM "DispatchCandidate" WHERE "attemptId" = $1::int AND "status" = 'QUEUED'
          ORDER BY "rank" LIMIT 50`,
        [attempt.id, settings.candidateRouteMaxAgeSeconds],
      )
      if (queued.length === 0) return { kind: 'need-candidates', attemptId: attempt.id, searchStage: attempt.searchStage }
      if (queued.some((row) => row.stale === true)) return { kind: 'need-refresh', attemptId: attempt.id }

      // Each candidate is re-checked by the rule it was FOUND by: a driver
      // found by his base must still be connected with no usable GPS fix;
      // one found by GPS must still have a fresh one.
      const bySource = (source: LocationSource) =>
        queued.filter((row) => (row.locationSource ?? 'GPS') === source).map((row) => toNumber(row.driverId))
      const eligibleIds = new Set([
        ...(await this.eligibleAmong(tx, bySource('GPS'), order, settings, 'GPS')),
        ...(await this.eligibleAmong(tx, bySource('BASE'), order, settings, 'BASE')),
      ])

      for (const row of queued) {
        const driverId = toNumber(row.driverId)
        const candidateId = toNumber(row.id)
        if (!eligibleIds.has(driverId)) {
          await tx.query(`UPDATE "DispatchCandidate" SET "status" = 'SKIPPED', "skipReason" = 'NOT_ELIGIBLE_AT_OFFER' WHERE "id" = $1::bigint`, [candidateId])
          continue
        }
        const routed = row.routeOk === true
        const inserted = await tx.query<Record<string, unknown>>(
          `INSERT INTO "OrderOffer" ("orderId", "attemptId", "driverId", "termsVersion", "expiresAt",
              "roadMeters", "etaSeconds", "straightLineMeters", "routeComputedAt")
           VALUES ($1::int, $2::int, $3::int, $4::int, now() + make_interval(secs => $5::int),
              $6::int, $7::int, $8::int, $9::timestamptz)
           ON CONFLICT DO NOTHING
           RETURNING ${OFFER_COLUMNS}`,
          [
            orderId,
            attempt.id,
            driverId,
            order.termsVersion,
            settings.offerTimeoutSeconds,
            routed ? toNullableNumber(row.roadMeters) : null,
            routed ? toNullableNumber(row.etaSeconds) : null,
            toNullableNumber(row.straightLineMeters),
            routed ? toNullableDate(row.routedAt) : null,
          ],
        )
        if (inserted.length === 0) {
          // Lost a race for this driver to another order: the unique index
          // decided. Skip them in this attempt and try the next one.
          await tx.query(`UPDATE "DispatchCandidate" SET "status" = 'SKIPPED', "skipReason" = 'RESERVED_CONCURRENTLY' WHERE "id" = $1::bigint`, [candidateId])
          continue
        }
        const offer = mapOffer(inserted[0])
        await tx.query(`UPDATE "DispatchCandidate" SET "status" = 'OFFERED' WHERE "id" = $1::bigint`, [candidateId])
        await tx.query(`UPDATE "DispatchAttempt" SET "offersMade" = "offersMade" + 1 WHERE "id" = $1::int`, [attempt.id])
        await this.announceOffer(tx, order, offer)
        return { kind: 'offered', offerId: offer.id, driverId }
      }
      return { kind: 'need-candidates', attemptId: attempt.id, searchStage: attempt.searchStage }
    })
  }

  private async announceOffer(tx: Sql, order: OrderRow, offer: OfferRow): Promise<void> {
    await recordEvent(tx, order.id, 'OFFER_CREATED', SYSTEM, {
      offerId: offer.id,
      driverId: offer.driverId,
      manual: offer.manual,
      expiresAt: offer.expiresAt.toISOString(),
      etaSeconds: offer.etaSeconds,
    })
    // The expiry job is scheduled for the absolute deadline. It is a wake-up
    // call, not the authority: the reconciler expires overdue offers even if
    // this row is lost, and the expiry itself re-checks the DB clock.
    await enqueue(tx, {
      topic: 'offer.expire',
      payload: { offerId: offer.id },
      dedupeKey: `offer-expire:${offer.id}`,
      availableAtSql: `'${offer.expiresAt.toISOString()}'::timestamptz`,
    })
    await enqueue(tx, { topic: 'push.offer', payload: { offerId: offer.id }, dedupeKey: `push-offer:${offer.id}` })
    await tx.query(
      `INSERT INTO "NotificationDelivery" ("offerId", "orderId", "driverId", "channel", "kind")
       VALUES ($1::uuid, $2::int, $3::int, 'PUSH', 'OFFER'), ($1::uuid, $2::int, $3::int, 'REALTIME', 'OFFER')
       ON CONFLICT DO NOTHING`,
      [offer.id, order.id, offer.driverId],
    )
    await enqueueRealtime(tx, `offer:${offer.id}:new`, [`driver:${offer.driverId}`, 'admin'], 'offer.new', {
      offerId: offer.id,
      orderId: order.id,
      expiresAt: offer.expiresAt.toISOString(),
    })
  }

  /** The availability + capability predicate, re-evaluated now, inside the caller's transaction */
  async eligibleAmong(tx: Sql, driverIds: number[], order: OrderRow, settings: DispatchSettings, source: LocationSource = 'GPS'): Promise<Set<number>> {
    if (driverIds.length === 0) return new Set()
    const p = new Params()
    const rows = await tx.query<{ id: number }>(
      `SELECT t."id" FROM ${eligibleFrom(source)}
        WHERE t."id" = ANY(${p.add(pgArray(driverIds))}::int[])
          AND ${availabilityPredicate(p, settings, source)}
          AND ${capabilityPredicate(p, requirementsOf(order))}`,
      p.values,
    )
    return new Set(rows.map((row) => toNumber(row.id)))
  }

  /**
   * Appends a ranked batch to the attempt. Re-validates under the order lock
   * that the attempt is still the open one — a batch computed for a search
   * that was stopped meanwhile is dropped.
   */
  async addCandidates(
    orderId: number,
    attemptId: number,
    searchStage: number,
    ranked: Ranked[],
    routeMeta: { provider: string; computedAt: Date },
  ): Promise<number> {
    return withRetryingTransaction(this.db, async (tx) => {
      const order = await lockOrder(tx, orderId)
      const attempt = await openAttempt(tx, orderId, true)
      if (order.status !== 'SEARCHING' || !attempt || attempt.id !== attemptId) return 0
      await tx.query(`UPDATE "DispatchAttempt" SET "searchStage" = GREATEST("searchStage", $2::int) WHERE "id" = $1::int`, [attemptId, searchStage])
      if (ranked.length === 0) return 0
      const [{ batch }] = await tx.query<{ batch: number }>(
        `SELECT COALESCE(max("batch"), -1) + 1 AS "batch" FROM "DispatchCandidate" WHERE "attemptId" = $1::int`,
        [attemptId],
      )
      const p = new Params()
      const tuples = ranked.map((c) => {
        const route = c.route
        const ok = route?.ok === true
        return `(${p.add(attemptId)}::int, ${p.add(c.driverId)}::int, ${p.add(batch)}::int, ${p.add(batch * 1000 + c.rank)}::int,
          ${p.add(c.straightLineMeters)}::int, ${p.add(ok ? Math.round((route as { meters: number }).meters) : null)}::int,
          ${p.add(ok ? Math.round((route as { seconds: number }).seconds) : null)}::int, ${p.add(ok)}::boolean,
          ${p.add(ok || !route ? null : (route as { error: string }).error)}, ${p.add(route ? routeMeta.computedAt : null)}::timestamptz,
          ${p.add(routeMeta.provider)}, ${p.add(c.source ?? 'GPS')})`
      })
      const inserted = await tx.query(
        `INSERT INTO "DispatchCandidate" ("attemptId", "driverId", "batch", "rank", "straightLineMeters", "roadMeters",
           "etaSeconds", "routeOk", "routeError", "routedAt", "routeProvider", "locationSource")
         VALUES ${tuples.join(', ')}
         ON CONFLICT ("attemptId", "driverId") DO NOTHING
         RETURNING 1`,
        p.values,
      )
      await recordEvent(tx, orderId, 'CANDIDATES_ADDED', SYSTEM, {
        attemptId,
        batch,
        searchStage,
        count: inserted.length,
        routed: ranked.filter((c) => c.route?.ok).length,
        provider: routeMeta.provider,
        byBaseLocation: ranked.filter((c) => c.source === 'BASE').length,
      })
      return inserted.length
    })
  }

  /**
   * Queued candidates of an attempt with their CURRENT position, for a route
   * refresh: the live fix, or the base for a candidate found by its base
   * (whose live fix is stale by definition). Skipped when neither exists.
   */
  async queuedForRefresh(attemptId: number): Promise<{ id: number; driverId: number; batch: number; latitude: number; longitude: number; straightLineMeters: number }[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT c."id", c."driverId", c."batch", c."straightLineMeters",
                CASE WHEN c."locationSource" = 'BASE' THEN t."baseLatitude" ELSE lc."latitude" END AS "latitude",
                CASE WHEN c."locationSource" = 'BASE' THEN t."baseLongitude" ELSE lc."longitude" END AS "longitude",
                c."rank"
           FROM "DispatchCandidate" c
           JOIN "FleetDriverProfile" t ON t."id" = c."driverId"
           LEFT JOIN "DriverLocationCurrent" lc ON lc."driverId" = c."driverId"
          WHERE c."attemptId" = $1::int AND c."status" = 'QUEUED'
       ) q
       WHERE q."latitude" IS NOT NULL AND q."longitude" IS NOT NULL
       ORDER BY q."rank" LIMIT 25`,
      [attemptId],
    )
    return rows.map((row) => ({
      id: toNumber(row.id),
      driverId: toNumber(row.driverId),
      batch: toNumber(row.batch),
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      straightLineMeters: toNumber(row.straightLineMeters),
    }))
  }

  async applyRefresh(
    attemptId: number,
    updates: { id: number; rank: number; route: RouteEntry }[],
    routeMeta: { provider: string; computedAt: Date },
  ): Promise<void> {
    await withRetryingTransaction(this.db, async (tx) => {
      for (const update of updates) {
        const ok = update.route.ok
        await tx.query(
          `UPDATE "DispatchCandidate"
              SET "rank" = $2::int, "roadMeters" = $3::int, "etaSeconds" = $4::int, "routeOk" = $5::boolean,
                  "routeError" = $6, "routedAt" = $7::timestamptz, "routeProvider" = $8
            WHERE "id" = $1::bigint AND "attemptId" = $9::int AND "status" = 'QUEUED'`,
          [
            update.id,
            update.rank,
            ok ? Math.round((update.route as { meters: number }).meters) : null,
            ok ? Math.round((update.route as { seconds: number }).seconds) : null,
            ok,
            ok ? null : (update.route as { error: string }).error,
            routeMeta.computedAt,
            routeMeta.provider,
            attemptId,
          ],
        )
      }
    })
  }

  /** No candidates anywhere in range: the engine's terminal step for an attempt */
  async failSearchIfStillEmpty(orderId: number, attemptId: number): Promise<boolean> {
    return withRetryingTransaction(this.db, async (tx) => {
      const order = await lockOrder(tx, orderId)
      const attempt = await openAttempt(tx, orderId, true)
      if (order.status !== 'SEARCHING' || !attempt || attempt.id !== attemptId) return false
      const remaining = await tx.query(
        `SELECT 1 FROM "DispatchCandidate" WHERE "attemptId" = $1::int AND "status" = 'QUEUED'
         UNION ALL SELECT 1 FROM "OrderOffer" WHERE "orderId" = $2::int AND "status" = 'PENDING' LIMIT 1`,
        [attemptId, orderId],
      )
      if (remaining.length > 0) return false
      await this.failSearch(tx, order, attempt, 'SEARCH_EXHAUSTED')
      return true
    })
  }

  private async failSearch(tx: Sql, order: OrderRow, attempt: AttemptRow, kind: AttentionKind): Promise<void> {
    const planned = planTransition('SEARCH_FAILED', snapshotOf(order), 'SYSTEM', { attentionKind: kind })
    await tx.query(`UPDATE "DispatchAttempt" SET "endedAt" = now(), "endReason" = $2 WHERE "id" = $1::int`, [attempt.id, kind])
    const p = new Params()
    await bumpOrder(
      tx,
      order.id,
      [`"status" = ${p.add(planned.to)}::"DispatchOrderStatus"`, `"attentionKind" = ${p.add(kind)}::"OrderAttentionKind"`, `"statusBeforeAttention" = NULL`],
      p,
    )
    await recordEvent(tx, order.id, 'SEARCH_FAILED', SYSTEM, { attemptId: attempt.id, kind, offersMade: attempt.offersMade })
    await raiseAlert(tx, order.id, 'SEARCH_FAILED', `search-failed:${attempt.id}`, { kind })
    await notifyOrderChanged(tx, order, 'SEARCH_FAILED')
  }

  // ─── Driver responses ─────────────────────────────────────────────────────

  /**
   * Accept: one transaction decides, and exactly one of accept / expire /
   * reject / revoke / cancel can win for a given offer.
   */
  async accept(offerId: string, driverId: number, tx: Sql): Promise<AcceptResult> {
    const ref = await orderIdOfOffer(tx, offerId)
    // Someone else's offer is reported as not found: never confirm it exists.
    if (!ref || ref.driverId !== driverId) throw new DispatchError('OFFER_NOT_FOUND')

    const order = await lockOrder(tx, ref.orderId)
    const offer = await lockOffer(tx, offerId)

    if (offer.status === 'ACCEPTED') {
      // A repeated accept of the offer this driver already won: same result.
      return { ok: true, orderId: order.id, status: order.status, replayed: true }
    }
    if (offer.status === 'EXPIRED') return refuse('OFFER_EXPIRED')
    if (offer.status === 'REVOKED') {
      return refuse(order.status === 'CANCELLED' ? 'ORDER_CANCELLED' : offer.closeReason === 'TERMS_CHANGED' ? 'OFFER_TERMS_CHANGED' : 'OFFER_REVOKED')
    }
    if (offer.status === 'REJECTED') return refuse('OFFER_ALREADY_RESPONDED')

    if (!offer.beforeDeadline) {
      // Arrived after the deadline (by the DB clock). Close it here and now —
      // committed with the refusal — and let dispatch move on.
      await this.closeOffer(tx, order, offer, 'EXPIRED', 'DEADLINE_AT_ACCEPT', { type: 'DRIVER', id: driverId })
      return refuse('OFFER_EXPIRED')
    }
    if (order.status === 'CANCELLED') return refuse('ORDER_CANCELLED')
    if (offer.termsVersion !== order.termsVersion) return refuse('OFFER_TERMS_CHANGED')
    if (order.activeAssignmentId !== null) return refuse('ORDER_ALREADY_ASSIGNED')
    if (order.status !== 'SEARCHING') return refuse('ORDER_NOT_SEARCHING')

    // Serialises with an admin revoking/suspending access (which UPDATEs this row).
    await lockFleetDriver(tx, driverId)
    const [driver] = await tx.query<{ isActive: boolean; suspended: boolean; busy: boolean }>(
      `SELECT t."isActive", (p."dispatchSuspendedAt" IS NOT NULL) AS "suspended",
              EXISTS (SELECT 1 FROM "OrderAssignment" a WHERE a."driverId" = t."id" AND a."endedAt" IS NULL) AS "busy"
         FROM "FleetDriverProfile" t LEFT JOIN "DriverPresence" p ON p."driverId" = t."id" WHERE t."id" = $1::int`,
      [driverId],
    )
    if (!driver?.isActive || driver.suspended) return refuse('DRIVER_UNAVAILABLE')
    if (driver.busy) return refuse('DRIVER_BUSY')

    const planned = planTransition('OFFER_ACCEPTED', snapshotOf(order), 'DRIVER')
    await tx.query(
      `UPDATE "OrderOffer" SET "status" = 'ACCEPTED', "respondedAt" = now() WHERE "id" = $1::uuid AND "status" = 'PENDING'`,
      [offerId],
    )
    let assignmentId: number
    try {
      const [row] = await tx.query<{ id: number }>(
        `INSERT INTO "OrderAssignment" ("orderId", "driverId", "offerId") VALUES ($1::int, $2::int, $3::uuid) RETURNING "id"`,
        [order.id, driverId, offerId],
      )
      assignmentId = toNumber(row.id)
    } catch (error) {
      // The indexes are the last line: reaching here means a check above
      // missed a concurrent writer. The whole transaction rolls back.
      if (isUniqueViolation(error, 'OrderAssignment_one_active_per_driver')) throw new DispatchError('DRIVER_BUSY')
      if (isUniqueViolation(error, 'OrderAssignment_one_active_per_order')) throw new DispatchError('ORDER_ALREADY_ASSIGNED')
      throw error
    }
    const p = new Params()
    await bumpOrder(
      tx,
      order.id,
      [`"status" = ${p.add(planned.to)}::"DispatchOrderStatus"`, `"activeAssignmentId" = ${p.add(assignmentId)}::int`, `"assignedAt" = now()`],
      p,
    )
    await tx.query(`UPDATE "DispatchAttempt" SET "endedAt" = now(), "endReason" = 'ASSIGNED' WHERE "orderId" = $1::int AND "endedAt" IS NULL`, [order.id])
    await tx.query(
      `UPDATE "DriverPresence" SET "availableSince" = NULL, "updatedAt" = now() WHERE "driverId" = $1::int`,
      [driverId],
    )
    await recordEvent(tx, order.id, 'OFFER_ACCEPTED', { type: 'DRIVER', id: driverId }, { offerId, assignmentId, status: planned.to })
    await notifyOrderChanged(tx, order, 'OFFER_ACCEPTED', [driverId])
    return { ok: true, orderId: order.id, status: planned.to, replayed: false }
  }

  async reject(offerId: string, driverId: number, reason: string | null, tx: Sql): Promise<{ ok: true } | Refusal> {
    const ref = await orderIdOfOffer(tx, offerId)
    if (!ref || ref.driverId !== driverId) throw new DispatchError('OFFER_NOT_FOUND')
    const order = await lockOrder(tx, ref.orderId)
    const offer = await lockOffer(tx, offerId)
    if (offer.status === 'REJECTED') return { ok: true }
    if (offer.status !== 'PENDING') return refuse(offer.status === 'EXPIRED' ? 'OFFER_EXPIRED' : 'OFFER_ALREADY_RESPONDED')
    if (!offer.beforeDeadline) {
      await this.closeOffer(tx, order, offer, 'EXPIRED', 'DEADLINE_AT_REJECT', { type: 'DRIVER', id: driverId })
      return refuse('OFFER_EXPIRED')
    }
    await this.closeOffer(tx, order, offer, 'REJECTED', reason ?? 'DRIVER_REJECTED', { type: 'DRIVER', id: driverId })
    return { ok: true }
  }

  /**
   * The expiry job. Safe to run any number of times, at any time: it changes
   * nothing unless the offer is still PENDING AND past its deadline by the DB
   * clock — so a stale or duplicated job can never close an accepted offer or
   * touch a newer attempt.
   */
  async expire(offerId: string): Promise<boolean> {
    return withRetryingTransaction(this.db, async (tx) => {
      const ref = await orderIdOfOffer(tx, offerId)
      if (!ref) return false
      const order = await lockOrder(tx, ref.orderId)
      const offer = await lockOffer(tx, offerId)
      if (offer.status !== 'PENDING' || offer.beforeDeadline) return false
      await this.closeOffer(tx, order, offer, 'EXPIRED', 'TIMEOUT', SYSTEM)
      return true
    })
  }

  private async closeOffer(
    tx: Sql,
    order: OrderRow,
    offer: OfferRow,
    status: 'REJECTED' | 'EXPIRED',
    reason: string,
    actor: ActorRef,
  ): Promise<void> {
    await tx.query(
      `UPDATE "OrderOffer" SET "status" = $2::"OrderOfferStatus", "respondedAt" = now(),
              "closeReason" = $3, "rejectReason" = CASE WHEN $2 = 'REJECTED' THEN $3 ELSE NULL END
        WHERE "id" = $1::uuid AND "status" = 'PENDING'`,
      [offer.id, status, reason],
    )
    await recordEvent(tx, order.id, status === 'REJECTED' ? 'OFFER_REJECTED' : 'OFFER_EXPIRED', actor, {
      offerId: offer.id,
      driverId: offer.driverId,
      reason,
    })
    await enqueueRealtime(tx, `offer:${offer.id}:closed`, [`driver:${offer.driverId}`, 'admin'], 'offer.closed', {
      offerId: offer.id,
      status,
    })

    const attempt = await openAttempt(tx, order.id, true)
    if (!attempt || attempt.id !== offer.attemptId) return
    if (attempt.mode === 'MANUAL') {
      // A manual offer that is declined or times out goes back to a person.
      await tx.query(`UPDATE "DispatchAttempt" SET "endedAt" = now(), "endReason" = $2 WHERE "id" = $1::int`, [attempt.id, `MANUAL_${status}`])
      const p = new Params()
      await bumpOrder(
        tx,
        order.id,
        [`"status" = 'NEEDS_ATTENTION'`, `"attentionKind" = 'MANUAL_OFFER_FAILED'`, `"statusBeforeAttention" = NULL`],
        p,
      )
      await recordEvent(tx, order.id, 'MANUAL_OFFER_FAILED', SYSTEM, { offerId: offer.id, status })
      await notifyOrderChanged(tx, order, 'MANUAL_OFFER_FAILED')
      return
    }
    // Rejection → next candidate immediately; expiry → same. Deduplicated per
    // closed offer, so a repeated job enqueues nothing new.
    await enqueue(tx, {
      topic: 'dispatch.advance',
      payload: { orderId: order.id, attemptId: attempt.id },
      dedupeKey: `advance:${attempt.id}:after:${offer.id}`,
    })
  }

  // ─── Operator: manual offer ───────────────────────────────────────────────

  async manualOffer(
    tx: Sql,
    input: {
      orderId: number
      driverId: number
      adminUserId: number
      overrideReason: string | null
      expectedVersion: number
      route: { meters: number; seconds: number; computedAt: Date } | null
    },
    settings: DispatchSettings,
  ): Promise<{ offerId: string; expiresAt: string }> {
    const order = await lockOrder(tx, input.orderId)
    if (order.version !== input.expectedVersion) throw new DispatchError('VERSION_CONFLICT', { currentVersion: order.version })
    const admin: ActorRef = { type: 'ADMIN', id: input.adminUserId }

    const startable =
      order.status === 'DRAFT' ||
      order.status === 'SEARCHING' ||
      (order.status === 'NEEDS_ATTENTION' && order.activeAssignmentId === null && !!order.attentionKind && SEARCH_ATTENTION_KINDS.includes(order.attentionKind))
    if (!startable) throw new DispatchError('INVALID_TRANSITION', { action: 'MANUAL_OFFER', status: order.status })
    const pending = await tx.query(`SELECT 1 FROM "OrderOffer" WHERE "orderId" = $1::int AND "status" = 'PENDING'`, [order.id])
    if (pending.length > 0) throw new DispatchError('INVALID_TRANSITION', { action: 'MANUAL_OFFER', reason: 'stop the pending offer first' })
    assertDispatchable(order)

    // The driver: hard constraints can never be overridden; soft ones (GPS,
    // online, heartbeat, external busy) can — with a reason, audited.
    await lockFleetDriver(tx, input.driverId)
    const rows = await tx.query<Record<string, unknown>>(
      `SELECT ${DRIVER_STATE_SELECT}, t."capacityTons", t."maxLoadTons", t."manipulator", t."wheelSkates"
         ${DRIVER_STATE_FROM} WHERE t."id" = $1::int`,
      [input.driverId],
    )
    if (!rows[0]) throw new DispatchError('DRIVER_UNAVAILABLE', { reason: 'not found' })
    const state = mapDriverState(rows[0])
    const availability = availabilityOf(state, settings)
    if (availability.reasons.includes('ON_ORDER')) throw new DispatchError('DRIVER_BUSY')
    if (availability.reasons.includes('RESERVED')) throw new DispatchError('DRIVER_RESERVED')
    const hard = availability.reasons.filter((r) => !MANUAL_OVERRIDABLE.includes(r))
    if (hard.length > 0) throw new DispatchError('DRIVER_UNAVAILABLE', { reasons: hard })
    const soft = availability.reasons.filter((r) => MANUAL_OVERRIDABLE.includes(r))
    if (soft.length > 0 && !input.overrideReason?.trim()) {
      throw new DispatchError('DRIVER_UNAVAILABLE', { reasons: soft, overridable: true })
    }
    const mismatches = capabilityMismatches(requirementsOf(order), {
      vehicleType: state.vehicleType,
      capacityTons: toNumber(rows[0].capacityTons),
      maxLoadTons: toNullableNumber(rows[0].maxLoadTons),
      manipulator: Boolean(rows[0].manipulator),
      wheelSkates: Boolean(rows[0].wheelSkates),
    })
    if (mismatches.length > 0) throw new DispatchError('CAPABILITY_MISMATCH', { mismatches })

    // Close any open AUTO attempt; this one is MANUAL (no auto-advance).
    await tx.query(`UPDATE "DispatchAttempt" SET "endedAt" = now(), "endReason" = 'REPLACED_BY_MANUAL' WHERE "orderId" = $1::int AND "endedAt" IS NULL`, [order.id])
    const attemptId = await createAttempt(tx, order.id, 'MANUAL', input.adminUserId, settings)
    if (order.status !== 'SEARCHING') {
      const p = new Params()
      await bumpOrder(
        tx,
        order.id,
        [`"status" = 'SEARCHING'`, `"attentionKind" = NULL`, `"statusBeforeAttention" = NULL`, `"dispatchStartedAt" = COALESCE("dispatchStartedAt", now())`],
        p,
      )
    }

    let inserted: Record<string, unknown>[]
    try {
      inserted = await tx.query<Record<string, unknown>>(
        `INSERT INTO "OrderOffer" ("orderId", "attemptId", "driverId", "termsVersion", "expiresAt", "manual", "createdByUserId",
            "roadMeters", "etaSeconds", "routeComputedAt")
         VALUES ($1::int, $2::int, $3::int, $4::int, now() + make_interval(secs => $5::int), true, $6::int, $7::int, $8::int, $9::timestamptz)
         RETURNING ${OFFER_COLUMNS}`,
        [
          order.id,
          attemptId,
          input.driverId,
          order.termsVersion,
          settings.offerTimeoutSeconds,
          input.adminUserId,
          input.route ? Math.round(input.route.meters) : null,
          input.route ? Math.round(input.route.seconds) : null,
          input.route?.computedAt ?? null,
        ],
      )
    } catch (error) {
      if (isUniqueViolation(error, 'OrderOffer_one_pending_per_driver')) throw new DispatchError('DRIVER_RESERVED')
      throw error
    }
    const offer = mapOffer(inserted[0])
    await tx.query(`UPDATE "DispatchAttempt" SET "offersMade" = 1 WHERE "id" = $1::int`, [attemptId])
    await recordEvent(tx, order.id, 'MANUAL_OFFER', admin, {
      offerId: offer.id,
      driverId: input.driverId,
      overriddenReasons: soft,
      overrideReason: soft.length > 0 ? input.overrideReason : null,
    })
    await this.announceOffer(tx, order, offer)
    await notifyOrderChanged(tx, order, 'MANUAL_OFFER')
    return { offerId: offer.id, expiresAt: offer.expiresAt.toISOString() }
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async currentOfferFor(driverId: number): Promise<OfferRow | null> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${OFFER_COLUMNS} FROM "OrderOffer" WHERE "driverId" = $1::int AND "status" = 'PENDING'`,
      [driverId],
    )
    return rows[0] ? mapOffer(rows[0]) : null
  }

  async offerById(offerId: string): Promise<OfferRow | null> {
    if (!/^[0-9a-f-]{36}$/i.test(offerId)) return null
    const rows = await this.db.query<Record<string, unknown>>(`SELECT ${OFFER_COLUMNS} FROM "OrderOffer" WHERE "id" = $1::uuid`, [offerId])
    return rows[0] ? mapOffer(rows[0]) : null
  }

  async offersOfOrder(orderId: number): Promise<OfferRow[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT ${OFFER_COLUMNS} FROM "OrderOffer" WHERE "orderId" = $1::int ORDER BY "createdAt"`,
      [orderId],
    )
    return rows.map(mapOffer)
  }

  /** The app reports that it rendered the offer — a delivery fact, never an acceptance */
  async acknowledgeDelivery(offerId: string, driverId: number, channel: 'PUSH' | 'REALTIME'): Promise<void> {
    await this.db.query(
      `UPDATE "NotificationDelivery" SET "status" = 'APP_ACKNOWLEDGED', "acknowledgedAt" = COALESCE("acknowledgedAt", now()), "updatedAt" = now()
        WHERE "offerId" = $1::uuid AND "driverId" = $2::int AND "channel" = $3`,
      [offerId, driverId, channel],
    )
  }
}

/**
 * Product decision, 2026-11: unconfirmed technical requirements and a missing
 * fixed price no longer block dispatch — an operator can still see and fill
 * them in (`unconfirmedRequirements` stays, for display), but neither is
 * required any more to start a search or send a manual offer. This reverses
 * the original deliberate safety rule in requirements.ts's docstring ("Unknown
 * is never 'fits'") — kept as a no-op rather than deleted so the history and
 * the reasoning stay visible if this needs revisiting before go-live.
 */
export function assertDispatchable(_order: OrderRow): void {
  // intentionally empty
}

/**
 * Automatic radius search needs a pickup point to search from
 * (DispatchEngine.expand/refresh compute straight-line and routed distance
 * FROM it) — an order created with no pickup coordinates ("phone it in") can
 * only ever be sent to a driver manually (`manualOffer`, which does not call
 * this). Call this only at the two entry points into automatic SEARCHING:
 * `startDispatch` and `releaseAssignment` with `restartSearch: true`.
 */
export function assertAutoDispatchable(order: OrderRow): void {
  if (order.pickupLatitude === null || order.pickupLongitude === null) throw new DispatchError('PICKUP_LOCATION_REQUIRED')
}

export async function createAttempt(
  tx: Sql,
  orderId: number,
  mode: 'AUTO' | 'MANUAL',
  adminUserId: number | null,
  settings: DispatchSettings,
): Promise<number> {
  const [{ next }] = await tx.query<{ next: number }>(
    `SELECT COALESCE(max("number"), 0) + 1 AS "next" FROM "DispatchAttempt" WHERE "orderId" = $1::int`,
    [orderId],
  )
  try {
    const [row] = await tx.query<{ id: number }>(
      `INSERT INTO "DispatchAttempt" ("orderId", "number", "mode", "startedByUserId", "alertAt", "deadlineAt", "maxOffers")
       VALUES ($1::int, $2::int, $3, $4::int, now() + make_interval(secs => $5::int), now() + make_interval(secs => $6::int), $7::int)
       RETURNING "id"`,
      [orderId, next, mode, adminUserId, settings.searchAlertSeconds, settings.searchMaxSeconds, mode === 'MANUAL' ? 1 : settings.maxOffersPerAttempt],
    )
    return toNumber(row.id)
  } catch (error) {
    if (error instanceof SqlError && isUniqueViolation(error)) throw new DispatchError('INVALID_TRANSITION', { reason: 'attempt already open' })
    throw error
  }
}
