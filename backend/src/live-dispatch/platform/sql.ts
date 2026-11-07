/**
 * The one database seam the live-dispatch modules depend on.
 *
 * ## Why not Prisma's typed client directly
 *
 * Every correctness property of dispatch — one pending offer per driver, one
 * active assignment per order, "an expired offer cannot be accepted" — is
 * enforced by Postgres itself: partial unique indexes, `SELECT … FOR UPDATE`,
 * and the database clock. Prisma's typed client can express none of those
 * (`FOR UPDATE`, `ON CONFLICT … WHERE`, `now()` comparisons), so these
 * repositories are raw, parameterised SQL anyway — the same call the codebase
 * already made for PostGIS in `NearestRepository`.
 *
 * Writing them against this interface instead of `PrismaService` buys one
 * thing that matters a lot: the SAME SQL runs in production through Prisma
 * (`prisma-sql.ts`) and in the integration tests through a dependency-free
 * Postgres wire client (`test-support/pg-wire.ts`) against a real server,
 * including real concurrent transactions. Nothing about the queries is
 * mocked.
 *
 * ## Rules for SQL written against this
 *
 * - Always `$n` placeholders, never string interpolation of values.
 * - Cast every parameter whose type Postgres cannot infer (`$1::int`,
 *   `$2::timestamptz`, `$3::jsonb`) — both drivers send untyped text.
 * - Arrays travel as a Postgres array literal built by `pgArray()` and cast
 *   (`$1::int[]`), JSON as `JSON.stringify(...)` cast to `::jsonb`.
 * - Timestamps are compared against the DATABASE clock (`now()`), never a
 *   `new Date()` from whichever process happens to run the query.
 */

export type SqlParam = string | number | boolean | null | Date | bigint

export type Row = Record<string, unknown>

export interface Sql {
  query<T = Row>(text: string, params?: readonly SqlParam[]): Promise<T[]>
}

export type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'

export interface SqlDatabase extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>, options?: { isolation?: IsolationLevel }): Promise<T>
}

/** A database error, normalised across both drivers — SQLSTATE + constraint name */
export class SqlError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly constraint?: string,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'SqlError'
  }
}

export const UNIQUE_VIOLATION = '23505'
export const SERIALIZATION_FAILURE = '40001'
export const DEADLOCK_DETECTED = '40P01'

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    error instanceof SqlError &&
    error.code === UNIQUE_VIOLATION &&
    (constraint === undefined || error.constraint === constraint)
  )
}

/**
 * A Postgres array literal for an integer or text array parameter.
 *
 * Text elements are always double-quoted with `\` and `"` escaped, which is
 * the array-literal grammar's own escaping — so a value can never break out of
 * its element. Pair with an explicit cast: `= ANY($1::int[])`.
 */
export function pgArray(values: readonly (number | string)[]): string {
  const parts = values.map((value) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('pgArray: non-finite number')
      return String(value)
    }
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  })
  return `{${parts.join(',')}}`
}

/**
 * Runs `fn` in a transaction, retrying a bounded number of times on
 * serialization failures and deadlocks — the two errors Postgres documents as
 * "safe to retry the whole transaction". Anything else propagates at once.
 */
export async function withRetryingTransaction<T>(
  db: SqlDatabase,
  fn: (tx: Sql) => Promise<T>,
  options: { isolation?: IsolationLevel; attempts?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await db.transaction(fn, { isolation: options.isolation })
    } catch (error) {
      lastError = error
      const retryable =
        error instanceof SqlError &&
        (error.code === SERIALIZATION_FAILURE || error.code === DEADLOCK_DETECTED)
      if (!retryable || attempt === attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, 5 * attempt + Math.random() * 20))
    }
  }
  throw lastError
}
