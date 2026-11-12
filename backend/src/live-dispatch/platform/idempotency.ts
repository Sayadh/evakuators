/**
 * Idempotent mutations.
 *
 * The key row, the mutation and the stored response are ONE transaction:
 *
 * 1. `INSERT … ON CONFLICT DO NOTHING` the key with the request fingerprint.
 *    A concurrent request with the same key blocks right here on the
 *    primary-key index until the first one commits or rolls back.
 * 2. If the key already existed: same fingerprint → return the stored
 *    response (same business result, nothing re-executed); different
 *    fingerprint → IDEMPOTENCY_KEY_REUSED.
 * 3. Otherwise run the operation in the same transaction and store its
 *    response — business refusals included, so a retried "accept" after an
 *    OFFER_EXPIRED gets OFFER_EXPIRED again, not a different answer.
 *
 * An unexpected exception rolls everything back, key included, so the client
 * may retry. Keys expire after `IDEMPOTENCY_TTL_HOURS`.
 */
import { createHash } from 'node:crypto'
import { DispatchError } from './errors'
import { withRetryingTransaction, type Sql, type SqlDatabase } from './sql'

export const IDEMPOTENCY_TTL_HOURS = 24
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/

export interface StoredResponse {
  status: number
  body: unknown
}

/** Canonical JSON (sorted keys) so key order in a body cannot change the fingerprint */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}

export function requestFingerprint(method: string, route: string, body: unknown): string {
  return createHash('sha256').update(`${method.toUpperCase()} ${route}\n${canonicalJson(body ?? null)}`).digest('hex')
}

export async function runIdempotent(
  db: SqlDatabase,
  input: { scope: string; key: string; fingerprint: string },
  operation: (tx: Sql) => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  if (!IDEMPOTENCY_KEY_PATTERN.test(input.key)) {
    throw new DispatchError('VALIDATION_FAILED', { field: 'Idempotency-Key' })
  }
  return withRetryingTransaction(db, async (tx) => {
    const inserted = await tx.query(
      `INSERT INTO "IdempotencyKey" ("scope", "key", "fingerprint", "responseStatus", "responseBody", "expiresAt")
       VALUES ($1, $2, $3, 0, 'null'::jsonb, now() + make_interval(hours => $4::int))
       ON CONFLICT ("scope", "key") DO NOTHING
       RETURNING "key"`,
      [input.scope, input.key, input.fingerprint, IDEMPOTENCY_TTL_HOURS],
    )
    if (inserted.length === 0) {
      const [existing] = await tx.query<{ fingerprint: string; responseStatus: number; responseBody: unknown; expired: boolean }>(
        `SELECT "fingerprint", "responseStatus", "responseBody", ("expiresAt" < now()) AS "expired"
           FROM "IdempotencyKey" WHERE "scope" = $1 AND "key" = $2`,
        [input.scope, input.key],
      )
      if (existing.fingerprint !== input.fingerprint) throw new DispatchError('IDEMPOTENCY_KEY_REUSED')
      if (existing.responseStatus === 0) throw new DispatchError('IDEMPOTENCY_IN_PROGRESS')
      return { status: existing.responseStatus, body: existing.responseBody, replayed: true }
    }

    const response = await operation(tx)
    await tx.query(
      `UPDATE "IdempotencyKey" SET "responseStatus" = $3::int, "responseBody" = $4::jsonb WHERE "scope" = $1 AND "key" = $2`,
      [input.scope, input.key, response.status, JSON.stringify(response.body ?? null)],
    )
    return { ...response, replayed: false }
  })
}

/**
 * Runs `run` inside a SAVEPOINT and turns its outcome into a storable response.
 *
 * A thrown DispatchError rolls back to the savepoint — so whatever the
 * operation had written before it refused is undone — and becomes the stored
 * response. An operation that must COMMIT something and still refuse (an
 * accept that arrives after the deadline marks the offer EXPIRED) returns a
 * `Refusal` value instead of throwing; `run` maps that to an error body.
 */
export async function asResponse(
  tx: Sql,
  run: () => Promise<unknown>,
  successStatus = 200,
): Promise<StoredResponse> {
  await tx.query('SAVEPOINT idem_op')
  try {
    const body = await run()
    await tx.query('RELEASE SAVEPOINT idem_op')
    if (isRefusalBody(body)) return { status: body.error.status, body: body.error.toBody() }
    return { status: successStatus, body }
  } catch (error) {
    if (error instanceof DispatchError) {
      await tx.query('ROLLBACK TO SAVEPOINT idem_op')
      return { status: error.status, body: error.toBody() }
    }
    throw error
  }
}

function isRefusalBody(value: unknown): value is { ok: false; error: DispatchError } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    (value as { error?: unknown }).error instanceof DispatchError
  )
}
