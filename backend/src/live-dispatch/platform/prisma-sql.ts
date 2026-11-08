/**
 * `SqlDatabase` over Prisma — the production driver for the live-dispatch SQL.
 *
 * - `query` → `$queryRawUnsafe(text, ...params)`: positional `$n` parameters,
 *   never interpolation (Prisma's documented API for parameterised raw SQL).
 * - `transaction` → Prisma's interactive transaction, with the isolation level
 *   passed through and explicit timeouts (a dispatch step must never hold a
 *   connection indefinitely).
 * - Results are normalised to the same plain shapes the test driver produces:
 *   BigInt and Decimal become numbers.
 * - Errors are normalised to `SqlError` with SQLSTATE + constraint name, so
 *   repositories can tell which unique index fired.
 *
 * NOT exercised in this repository's sandbox (Prisma could not be installed
 * there) — the same SQL runs through `test-support/pg-wire.ts` in the
 * integration tests. First staging run must include `npm run test:live` with
 * LIVE_DISPATCH_TEST_DATABASE_URL pointing at a scratch server, and a smoke run
 * of the API (see docs/live-dispatch/08-testing.md).
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import { SqlError, type IsolationLevel, type Row, type Sql, type SqlDatabase, type SqlParam } from './sql'

type RawClient = Pick<PrismaClient, '$queryRawUnsafe'>

function normalise(value: unknown): unknown {
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : value
  if (value instanceof Prisma.Decimal) return value.toNumber()
  return value
}

function normaliseRow(row: Record<string, unknown>): Row {
  const out: Row = {}
  for (const [key, value] of Object.entries(row)) out[key] = normalise(value)
  return out
}

function toSqlError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (error.meta ?? {}) as { code?: string; message?: string }
    const message = meta.message ?? error.message
    const constraint = /constraint "([^"]+)"/.exec(message)?.[1]
    // P2010 = raw query failed, meta.code is the SQLSTATE. P2002 = unique
    // constraint (typed client) — mapped to the same SQLSTATE.
    const code = meta.code ?? (error.code === 'P2002' ? '23505' : error.code === 'P2034' ? '40001' : 'XX000')
    return new SqlError(message, code, constraint)
  }
  return error
}

class PrismaSql implements Sql {
  constructor(private readonly client: RawClient) {}

  async query<T = Row>(text: string, params: readonly SqlParam[] = []): Promise<T[]> {
    try {
      const rows = (await this.client.$queryRawUnsafe<Record<string, unknown>[]>(text, ...params)) ?? []
      return rows.map(normaliseRow) as T[]
    } catch (error) {
      throw toSqlError(error)
    }
  }
}

const ISOLATION: Record<IsolationLevel, Prisma.TransactionIsolationLevel> = {
  'READ COMMITTED': Prisma.TransactionIsolationLevel.ReadCommitted,
  'REPEATABLE READ': Prisma.TransactionIsolationLevel.RepeatableRead,
  SERIALIZABLE: Prisma.TransactionIsolationLevel.Serializable,
}

export class PrismaSqlDatabase implements SqlDatabase {
  private readonly root: PrismaSql

  constructor(private readonly prisma: PrismaClient) {
    this.root = new PrismaSql(prisma)
  }

  query<T = Row>(text: string, params?: readonly SqlParam[]): Promise<T[]> {
    return this.root.query<T>(text, params)
  }

  async transaction<T>(fn: (tx: Sql) => Promise<T>, options?: { isolation?: IsolationLevel }): Promise<T> {
    try {
      return await this.prisma.$transaction((tx) => fn(new PrismaSql(tx)), {
        isolationLevel: ISOLATION[options?.isolation ?? 'READ COMMITTED'],
        maxWait: 5_000,
        timeout: 15_000,
      })
    } catch (error) {
      throw toSqlError(error)
    }
  }
}
