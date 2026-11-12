/**
 * Transactional outbox: enqueue (inside the business transaction) and claim
 * (by the worker, with SKIP LOCKED so several workers never take the same row).
 *
 * Delivery is AT LEAST ONCE. Every handler must be idempotent — and they are,
 * because each one re-reads the authoritative row and acts only if it still
 * applies (an expiry job for an offer that is no longer PENDING is a no-op).
 */
import type { Sql } from '../platform/sql'
import { Params, toDate } from '../platform/params'

export type OutboxTopic =
  | 'dispatch.advance'
  | 'offer.expire'
  | 'push.offer'
  | 'push.offerClosed'
  | 'push.order'
  | 'push.walletLow'
  | 'push.walletCredited'
  | 'realtime'

export interface OutboxMessage {
  topic: OutboxTopic
  payload: Record<string, unknown>
  /** Stable identity: enqueueing the same key twice is a no-op */
  dedupeKey: string
  /** SQL expression for availableAt; default `now()` */
  availableAtSql?: string
  maxAttempts?: number
}

export async function enqueue(tx: Sql, message: OutboxMessage): Promise<boolean> {
  const p = new Params()
  const rows = await tx.query<{ id: string }>(
    `INSERT INTO "OutboxEvent" ("topic", "payload", "dedupeKey", "availableAt", "maxAttempts")
     VALUES (${p.add(message.topic)}, ${p.add(JSON.stringify(message.payload))}::jsonb, ${p.add(message.dedupeKey)},
             ${message.availableAtSql ?? 'now()'}, ${p.add(message.maxAttempts ?? 8)}::int)
     ON CONFLICT ("dedupeKey") DO NOTHING
     RETURNING "id"::text AS "id"`,
    p.values,
  )
  return rows.length > 0
}

/** Realtime fan-out, carried by the outbox so it is committed with the change */
export async function enqueueRealtime(
  tx: Sql,
  dedupeKey: string,
  audiences: string[],
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  await enqueue(tx, {
    topic: 'realtime',
    payload: { audiences, event, data },
    dedupeKey: `rt:${dedupeKey}`,
    maxAttempts: 3,
  })
}

export interface ClaimedMessage {
  id: string
  topic: OutboxTopic
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  createdAt: Date
}

export async function claimDue(db: Sql, workerId: string, limit: number, lockSeconds = 30): Promise<ClaimedMessage[]> {
  const p = new Params()
  const rows = await db.query<Record<string, unknown>>(
    `UPDATE "OutboxEvent" o
        SET "lockedUntil" = now() + make_interval(secs => ${p.add(lockSeconds)}::int),
            "lockedBy" = ${p.add(workerId)},
            "attempts" = o."attempts" + 1
      WHERE o."id" IN (
        SELECT "id" FROM "OutboxEvent"
         WHERE "processedAt" IS NULL
           AND "availableAt" <= now()
           AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
           AND "attempts" < "maxAttempts"
         ORDER BY "availableAt"
         LIMIT ${p.add(limit)}::int
         FOR UPDATE SKIP LOCKED)
      RETURNING o."id"::text AS "id", o."topic", o."payload", o."attempts", o."maxAttempts", o."createdAt"`,
    p.values,
  )
  return rows.map((row) => ({
    id: String(row.id),
    topic: row.topic as OutboxTopic,
    payload: row.payload as Record<string, unknown>,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
    createdAt: toDate(row.createdAt),
  }))
}

/** Marks done — only if this worker still holds the lease (a slow worker whose lease expired must not overwrite) */
export async function markProcessed(db: Sql, id: string, workerId: string): Promise<void> {
  await db.query(
    `UPDATE "OutboxEvent" SET "processedAt" = now(), "lockedUntil" = NULL, "lastError" = NULL
      WHERE "id" = $1::uuid AND "lockedBy" = $2 AND "processedAt" IS NULL`,
    [id, workerId],
  )
}

/** Exponential backoff with a cap; past maxAttempts the row stays as a visible dead letter */
export async function markFailed(db: Sql, id: string, workerId: string, error: string, attempts: number): Promise<void> {
  const backoffSeconds = Math.min(300, 2 ** Math.min(attempts, 8))
  await db.query(
    `UPDATE "OutboxEvent"
        SET "lockedUntil" = NULL, "lastError" = left($3, 2000),
            "availableAt" = now() + make_interval(secs => $4::int)
      WHERE "id" = $1::uuid AND "lockedBy" = $2 AND "processedAt" IS NULL`,
    [id, workerId, error, backoffSeconds],
  )
}

export interface OutboxHealth {
  backlog: number
  oldestDueSeconds: number | null
  deadLetters: number
}

export async function outboxHealth(db: Sql): Promise<OutboxHealth> {
  const [row] = await db.query<Record<string, unknown>>(
    `SELECT
       count(*) FILTER (WHERE "processedAt" IS NULL AND "attempts" < "maxAttempts" AND "availableAt" <= now())::int AS "backlog",
       EXTRACT(EPOCH FROM now() - min("availableAt") FILTER (WHERE "processedAt" IS NULL AND "attempts" < "maxAttempts" AND "availableAt" <= now()))::float8 AS "oldest",
       count(*) FILTER (WHERE "processedAt" IS NULL AND "attempts" >= "maxAttempts")::int AS "dead"
     FROM "OutboxEvent"`,
  )
  return {
    backlog: Number(row.backlog),
    oldestDueSeconds: row.oldest === null ? null : Number(row.oldest),
    deadLetters: Number(row.dead),
  }
}
