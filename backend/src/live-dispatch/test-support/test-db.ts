/**
 * Creates a throw-away database, applies EVERY migration in order, and hands
 * back a pool. TEST SUPPORT ONLY.
 *
 * Opt-in by environment, never by accident: it refuses to run unless
 * `LIVE_DISPATCH_TEST_DATABASE_URL` is set, and it only ever CREATEs and DROPs
 * databases whose name starts with `ld_test_`. It never reads `DATABASE_URL`
 * (docs/testing.md: a test must not silently open whatever database that
 * variable happens to point at).
 *
 * PostGIS: if the server has the extension it is used for real; if not, the
 * PostGIS statements of the original nearest-search migration are stripped
 * (the same treatment `migrations.pglite.spec.ts` gives them) and the
 * live-dispatch PostGIS migration is skipped — and `hasPostgis` says so, so
 * spatial tests can skip themselves loudly rather than pass vacuously.
 */
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PgPool, PgWireClient, parseConnectionString } from './pg-wire'

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'prisma', 'migrations')
const LIVE_POSTGIS_MIGRATION = '20261108090200_live_dispatch_postgis'

export interface TestDatabase {
  pool: PgPool
  name: string
  hasPostgis: boolean
  url: string
  drop(): Promise<void>
}

export function testDatabaseUrl(): string | null {
  return process.env.LIVE_DISPATCH_TEST_DATABASE_URL ?? null
}

function withoutPostgis(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS postgis;/gi, '')
    .replace(/ALTER TABLE "TowTruck"\s+ADD COLUMN "location"[\s\S]*?STORED;/gi, '')
    .replace(/CREATE INDEX "TowTruck_location_gist"[\s\S]*?;/gi, '')
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const url = testDatabaseUrl()
  if (!url) throw new Error('LIVE_DISPATCH_TEST_DATABASE_URL is not set')
  const base = parseConnectionString(url)
  const name = `ld_test_${randomBytes(5).toString('hex')}`

  const admin = new PgWireClient(base)
  await admin.connect()
  await admin.query(`CREATE DATABASE ${name}`)
  const [{ available }] = await admin.query<{ available: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') AS available`,
  )
  await admin.close()

  const options = { ...base, database: name }
  const setup = new PgWireClient(options)
  await setup.connect()
  for (const dir of readdirSync(MIGRATIONS_DIR).filter((d) => /^\d+_/.test(d)).sort()) {
    if (!available && dir === LIVE_POSTGIS_MIGRATION) continue
    let sql = readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')
    if (!available) sql = withoutPostgis(sql)
    try {
      // Applied verbatim, as `prisma migrate deploy` would, in one transaction
      await setup.simpleQuery(`BEGIN;\n${sql}\nCOMMIT;`)
    } catch (error) {
      await setup.simpleQuery('ROLLBACK').catch(() => undefined)
      throw new Error(`${dir}: ${(error as Error).message}`)
    }
  }
  await setup.close()

  const pool = new PgPool(options, 40)
  return {
    pool,
    name,
    hasPostgis: available,
    url: `${url.replace(/\/[^/]*$/, '')}/${name}`,
    async drop() {
      await pool.end()
      const cleanup = new PgWireClient(base)
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await cleanup.close()
    },
  }
}

/** Inserts a minimal approved TowTruck row and returns its id */
export async function insertTowTruck(
  pool: PgPool,
  overrides: Partial<{
    vehicleType: string
    capacityTons: number
    manipulator: boolean
    wheelSkates: boolean
    isActive: boolean
    phone: string
  }> = {},
): Promise<number> {
  const suffix = randomBytes(4).toString('hex')
  const phone = overrides.phone ?? `+3749${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
  const [row] = await pool.query<{ id: number }>(
    `INSERT INTO "TowTruck" ("slug", "driverName", "phone", "description", "vehicleBrand", "vehicleYear",
       "vehicleType", "capacityTons", "manipulator", "wheelSkates", "isActive", "locationName",
       "services", "serviceAreas", "updatedAt")
     VALUES ($1, $2, $3, '', 'Test', 2015, $4, $5::float8, $6::boolean, $7::boolean, $8::boolean, 'Yerevan',
       '{}'::text[], '[]'::jsonb, now())
     RETURNING "id"`,
    [
      `t-${suffix}`,
      `Driver ${suffix}`,
      phone,
      overrides.vehicleType ?? 'flatbed',
      overrides.capacityTons ?? 3.5,
      overrides.manipulator ?? false,
      overrides.wheelSkates ?? false,
      overrides.isActive ?? true,
    ],
  )
  return row.id
}

export async function insertAdminUser(pool: PgPool, role: 'ADMIN' | 'DISPATCHER' = 'ADMIN'): Promise<number> {
  const [row] = await pool.query<{ id: number }>(
    `INSERT INTO "User" ("email", "passwordHash", "role", "updatedAt") VALUES ($1, 'x', $2::"UserRole", now()) RETURNING "id"`,
    [`ops-${randomBytes(4).toString('hex')}@test.local`, role],
  )
  return row.id
}
