/**
 * The safety net. Runs every few seconds in the worker and repairs anything
 * a lost job, a crashed process or a Redis restart could have left behind —
 * using ONLY the database as the source of truth:
 *
 * - PENDING offers past their deadline → expired (and dispatch moves on)
 * - SEARCHING orders with no live offer and no queued step → step re-queued
 * - searches past the operator-alert time → alert (once)
 * - active orders whose driver lost GPS, or never started moving → alert
 *   (NEVER an automatic second assignment)
 * - outbox rows whose lease expired are re-claimable by construction
 *
 * Every action is idempotent, so two reconcilers running at once (e.g. during
 * a deploy overlap) are harmless.
 */
import { enqueue } from '../notify/outbox'
import { raiseAlert } from '../platform/audit'
import { toNumber } from '../platform/params'
import type { DispatchSettings } from '../platform/settings'
import type { SqlDatabase } from '../platform/sql'
import type { OffersRepository } from './offers.repository'

export interface ReconcileReport {
  expiredOffers: number
  requeuedSearches: number
  slowSearchAlerts: number
  gpsLostAlerts: number
  notMovingAlerts: number
}

export class Reconciler {
  constructor(
    private readonly db: SqlDatabase,
    private readonly offers: OffersRepository,
  ) {}

  async run(settings: DispatchSettings): Promise<ReconcileReport> {
    const report: ReconcileReport = { expiredOffers: 0, requeuedSearches: 0, slowSearchAlerts: 0, gpsLostAlerts: 0, notMovingAlerts: 0 }

    const overdue = await this.db.query<{ id: string }>(
      `SELECT "id"::text AS "id" FROM "OrderOffer" WHERE "status" = 'PENDING' AND "expiresAt" <= now() ORDER BY "expiresAt" LIMIT 200`,
    )
    for (const { id } of overdue) {
      if (await this.offers.expire(id)) report.expiredOffers++
    }

    // A SEARCHING order with nothing in flight: no live offer and no
    // unprocessed advance step. The 30-second bucket in the key lets the
    // reconciler retry a step that failed, without flooding the outbox.
    const stuck = await this.db.query<{ orderId: number; attemptId: number }>(
      `SELECT o."id" AS "orderId", a."id" AS "attemptId"
         FROM "DispatchOrder" o
         JOIN "DispatchAttempt" a ON a."orderId" = o."id" AND a."endedAt" IS NULL AND a."mode" = 'AUTO'
        WHERE o."status" = 'SEARCHING'
          AND NOT EXISTS (SELECT 1 FROM "OrderOffer" x WHERE x."orderId" = o."id" AND x."status" = 'PENDING')
          AND NOT EXISTS (SELECT 1 FROM "OutboxEvent" e
                           WHERE e."topic" = 'dispatch.advance' AND e."processedAt" IS NULL AND e."attempts" < e."maxAttempts"
                             AND (e."payload"->>'orderId')::int = o."id")
        LIMIT 200`,
    )
    const bucket = Math.floor(Date.now() / 30_000)
    for (const row of stuck) {
      const created = await enqueue(this.db, {
        topic: 'dispatch.advance',
        payload: { orderId: toNumber(row.orderId), attemptId: toNumber(row.attemptId) },
        dedupeKey: `advance:${row.attemptId}:reconcile:${bucket}`,
      })
      if (created) report.requeuedSearches++
    }

    const slow = await this.db.query<{ orderId: number; attemptId: number }>(
      `SELECT a."orderId", a."id" AS "attemptId" FROM "DispatchAttempt" a
         JOIN "DispatchOrder" o ON o."id" = a."orderId" AND o."status" = 'SEARCHING'
        WHERE a."endedAt" IS NULL AND a."alertAt" <= now()`,
    )
    for (const row of slow) {
      if (await raiseAlert(this.db, toNumber(row.orderId), 'SEARCH_SLOW', `search-slow:${row.attemptId}`, { attemptId: toNumber(row.attemptId) })) {
        report.slowSearchAlerts++
      }
    }

    // Active orders: GPS lost. Ten-minute buckets: one alert per stretch of
    // silence, re-raised if it lasts.
    const gpsLost = await this.db.query<{ orderId: number; assignmentId: number; towTruckId: number }>(
      `SELECT o."id" AS "orderId", a."id" AS "assignmentId", a."towTruckId"
         FROM "DispatchOrder" o JOIN "OrderAssignment" a ON a."id" = o."activeAssignmentId"
         LEFT JOIN "DriverLocationCurrent" lc ON lc."towTruckId" = a."towTruckId"
        WHERE o."status" IN ('PRICE_CONFIRMATION_PENDING','ASSIGNED','EN_ROUTE_TO_PICKUP','ARRIVED_AT_PICKUP','TRANSPORTING')
          AND a."startedAt" <= now() - make_interval(secs => $1::int)
          AND (lc."measuredAt" IS NULL OR lc."measuredAt" <= now() - make_interval(secs => $1::int))`,
      [settings.activeGpsLostAlertSeconds],
    )
    const tenMinutes = Math.floor(Date.now() / 600_000)
    for (const row of gpsLost) {
      if (await raiseAlert(this.db, toNumber(row.orderId), 'ACTIVE_GPS_LOST', `gps-lost:${row.assignmentId}:${tenMinutes}`, { towTruckId: toNumber(row.towTruckId) })) {
        report.gpsLostAlerts++
      }
    }

    const notMoving = await this.db.query<{ orderId: number; assignmentId: number }>(
      `SELECT o."id" AS "orderId", a."id" AS "assignmentId"
         FROM "DispatchOrder" o JOIN "OrderAssignment" a ON a."id" = o."activeAssignmentId"
        WHERE o."status" IN ('ASSIGNED','PRICE_CONFIRMATION_PENDING') AND o."enRouteAt" IS NULL
          AND a."startedAt" <= now() - make_interval(secs => $1::int)`,
      [settings.notMovingAlertSeconds],
    )
    for (const row of notMoving) {
      if (await raiseAlert(this.db, toNumber(row.orderId), 'DRIVER_NOT_MOVING', `not-moving:${row.assignmentId}`)) report.notMovingAlerts++
    }
    return report
  }

  /** Slow housekeeping — hourly is plenty */
  async housekeeping(settings: DispatchSettings, purgeHistory: (days: number) => Promise<number>): Promise<Record<string, number>> {
    const history = await purgeHistory(settings.locationHistoryRetentionDays)
    const keys = await this.db.query(`DELETE FROM "IdempotencyKey" WHERE "expiresAt" < now() RETURNING 1`)
    const outbox = await this.db.query(
      `DELETE FROM "OutboxEvent" WHERE "id" IN (SELECT "id" FROM "OutboxEvent" WHERE "processedAt" < now() - interval '7 days' LIMIT 10000) RETURNING 1`,
    )
    return { locationHistory: history, idempotencyKeys: keys.length, outbox: outbox.length }
  }
}
