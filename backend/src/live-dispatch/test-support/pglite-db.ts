/**
 * An in-memory Postgres (PGlite, WebAssembly) behind the same `SqlDatabase`
 * the repositories use — TEST SUPPORT ONLY (2026-11-12).
 *
 *   LIVE_DISPATCH_TEST_DATABASE_URL=pglite npm run test:live
 *
 * runs every integration test with no Postgres server at all: a laptop, CI, a
 * sandbox. It is real Postgres (same planner, constraints, locks, isolation),
 * minus PostGIS — the PostGIS migration is skipped exactly as for a server
 * without the extension, so spatial queries take their non-PostGIS path.
 * One connection: statements and transactions are serialized, which makes
 * the concurrency suite a check of correctness, not of contention.
 */
import type { IsolationLevel, Row, Sql, SqlDatabase, SqlParam } from '../platform/sql'

interface PgliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(text: string): Promise<unknown>
  close(): Promise<void>
}

/** pg-wire hands back numbers where PGlite hands back BigInt (count(*), bigint ids) */
function normalize<T>(rows: T[]): T[] {
  for (const row of rows as Record<string, unknown>[]) {
    for (const key of Object.keys(row)) if (typeof row[key] === 'bigint') row[key] = Number(row[key])
  }
  return rows
}

export class PgliteDatabase implements SqlDatabase {
  private chain: Promise<unknown> = Promise.resolve()

  private constructor(private readonly db: PgliteLike) {}

  static async create(): Promise<PgliteDatabase> {
    // Loaded lazily: only this opt-in path needs the (dev-only) package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require('@electric-sql/pglite') as { PGlite: { create(): Promise<PgliteLike> } }
    return new PgliteDatabase(await PGlite.create())
  }

  /** One statement or transaction at a time, in arrival order */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async raw<T>(text: string, params?: readonly SqlParam[]): Promise<T[]> {
    const result = await this.db.query<T>(text, params ? [...params] : [])
    return normalize(result.rows)
  }

  exec(sql: string): Promise<unknown> {
    return this.serialize(() => this.db.exec(sql))
  }

  query<T = Row>(text: string, params?: readonly SqlParam[]): Promise<T[]> {
    return this.serialize(() => this.raw<T>(text, params))
  }

  transaction<T>(fn: (tx: Sql) => Promise<T>, options?: { isolation?: IsolationLevel }): Promise<T> {
    return this.serialize(async () => {
      await this.db.exec(`BEGIN ISOLATION LEVEL ${options?.isolation ?? 'READ COMMITTED'}`)
      const tx: Sql = { query: <R = Row>(text: string, params?: readonly SqlParam[]) => this.raw<R>(text, params) }
      try {
        const result = await fn(tx)
        await this.db.exec('COMMIT')
        return result
      } catch (error) {
        await this.db.exec('ROLLBACK').catch(() => undefined)
        throw error
      }
    })
  }

  async end(): Promise<void> {
    await this.db.close()
  }
}
