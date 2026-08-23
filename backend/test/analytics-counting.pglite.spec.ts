import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Does the counter actually count correctly?
 *
 * Every other analytics test in this suite checks a pure mapper — the pivot,
 * the zero-fill, the rounding. None of them execute the statement that decides
 * what a driver's numbers ARE: the data-modifying CTE in
 * `AnalyticsRepository.recordEvent()`, which inserts a dedup row and increments
 * an aggregate in one shot. That statement is where "is my count right" is
 * genuinely answered, it is raw SQL, and it had no test at all.
 *
 * PGlite is Postgres compiled to WASM, so this is the real engine running the
 * real DDL and the real statement — the same harness and the same reasoning as
 * `migrations.pglite.spec.ts`, which this file deliberately mirrors rather than
 * inventing a second way to stand up a database.
 *
 * The SQL below is a verbatim copy of the repository's, with Prisma's tagged
 * template turned into numbered placeholders. That duplication is the one real
 * cost of this file and is accepted knowingly: the alternative is instantiating
 * PrismaClient against PGlite, which needs a driver adapter and a generated
 * client this suite deliberately does not build (see vitest.config.ts). If the
 * repository's statement changes, this copy must change with it — the assertions
 * below are what make that worth doing.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations')

let db: PGlite

/** Verbatim from AnalyticsRepository.recordEvent(), $1..$4 for the bindings */
const RECORD_EVENT_SQL = `
  WITH new_visitor_day AS (
    INSERT INTO "AnalyticsVisitorDay" ("towTruckId", "statDate", "eventType", "visitorKey")
    VALUES ($1, $2::date, $3::"AnalyticsEventType", $4)
    ON CONFLICT ("towTruckId", "statDate", "eventType", "visitorKey") DO NOTHING
    RETURNING 1 AS counted
  )
  INSERT INTO "AnalyticsDailyStat" ("towTruckId", "statDate", "eventType", "eventCount", "createdAt", "updatedAt")
  SELECT $1, $2::date, $3::"AnalyticsEventType", 1, NOW(), NOW()
  FROM new_visitor_day
  ON CONFLICT ("towTruckId", "statDate", "eventType")
  DO UPDATE SET
    "eventCount" = "AnalyticsDailyStat"."eventCount" + 1,
    "updatedAt" = NOW()
`

function withoutPostgis(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS postgis;/gi, '')
    .replace(/^\s*ALTER TABLE[^;]*GENERATED ALWAYS AS[^;]*;/gim, '')
    .replace(/^\s*CREATE INDEX[^;]*USING GIST[^;]*;/gim, '')
}

async function seedTruck(id: number, slug: string, phone: string): Promise<void> {
  await db.query(
    `INSERT INTO "TowTruck" (id, slug, "driverName", phone, description, "vehicleBrand",
       "vehicleYear", "vehicleType", "capacityTons", "locationName", "serviceAreas",
       services, "updatedAt")
     VALUES ($1, $2, 'Աշոտ', $3, 'նկարագրություն', 'Isuzu', 2018, 'flatbed', 3, 'Աբովյան',
       '[]'::jsonb, ARRAY[]::text[], now())`,
    [id, slug, phone],
  )
}

/** One tracked event. Returns whether it moved a counter, exactly as the repo does. */
async function record(
  towTruckId: number,
  statDate: string,
  eventType: string,
  visitorKey: string,
): Promise<boolean> {
  const result = await db.query(RECORD_EVENT_SQL, [towTruckId, statDate, eventType, visitorKey])
  return (result.affectedRows ?? 0) > 0
}

async function counterFor(
  towTruckId: number,
  statDate: string,
  eventType: string,
): Promise<number> {
  const { rows } = await db.query<{ eventCount: number }>(
    `SELECT "eventCount" FROM "AnalyticsDailyStat"
     WHERE "towTruckId" = $1 AND "statDate" = $2::date AND "eventType" = $3::"AnalyticsEventType"`,
    [towTruckId, statDate, eventType],
  )
  return rows[0]?.eventCount ?? 0
}

/** The all-time per-event total — what the drivers CSV export and the cards read */
async function allTimeTotal(towTruckId: number, eventType: string): Promise<number> {
  const { rows } = await db.query<{ total: number | null }>(
    `SELECT SUM("eventCount")::int AS total FROM "AnalyticsDailyStat"
     WHERE "towTruckId" = $1 AND "eventType" = $2::"AnalyticsEventType"`,
    [towTruckId, eventType],
  )
  return rows[0]?.total ?? 0
}

/** COUNT(DISTINCT visitorKey) — what the "Եզակի այցելուներ" card reads */
async function uniqueVisitors(
  towTruckId: number,
  eventType: string,
  from: string,
  to: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(DISTINCT "visitorKey")::int AS count
     FROM "AnalyticsVisitorDay"
     WHERE "towTruckId" = $1 AND "eventType" = $2::"AnalyticsEventType"
       AND "statDate" BETWEEN $3::date AND $4::date`,
    [towTruckId, eventType, from, to],
  )
  return rows[0]?.count ?? 0
}

beforeAll(async () => {
  db = await PGlite.create()

  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  for (const dir of dirs) {
    const sql = withoutPostgis(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
    if (!sql.trim()) continue
    await db.exec(sql)
  }

  await seedTruck(1, 'truck-one', '+37411000001')
  await seedTruck(2, 'truck-two', '+37411000002')
}, 180_000)

describe('the dedup rule: one visitor, one day, one count', () => {
  it('counts a first event', async () => {
    expect(await record(1, '2026-03-01', 'PAGE_VIEW', 'visitor-a')).toBe(true)
    expect(await counterFor(1, '2026-03-01', 'PAGE_VIEW')).toBe(1)
  })

  it('does NOT count the same visitor again the same day', async () => {
    // The impatient double-tap this whole CTE exists for.
    expect(await record(1, '2026-03-01', 'PAGE_VIEW', 'visitor-a')).toBe(false)
    expect(await record(1, '2026-03-01', 'PAGE_VIEW', 'visitor-a')).toBe(false)
    expect(await counterFor(1, '2026-03-01', 'PAGE_VIEW')).toBe(1)
  })

  it('counts a DIFFERENT visitor the same day', async () => {
    expect(await record(1, '2026-03-01', 'PAGE_VIEW', 'visitor-b')).toBe(true)
    expect(await counterFor(1, '2026-03-01', 'PAGE_VIEW')).toBe(2)
  })

  it('counts the SAME visitor again on a different day', async () => {
    expect(await record(1, '2026-03-02', 'PAGE_VIEW', 'visitor-a')).toBe(true)
    expect(await counterFor(1, '2026-03-02', 'PAGE_VIEW')).toBe(1)
    // Yesterday is untouched — days are independent buckets.
    expect(await counterFor(1, '2026-03-01', 'PAGE_VIEW')).toBe(2)
  })

  it('keeps event types independent for the same visitor and day', async () => {
    expect(await record(1, '2026-03-01', 'PHONE_CLICK', 'visitor-a')).toBe(true)
    expect(await counterFor(1, '2026-03-01', 'PHONE_CLICK')).toBe(1)
    // A phone click must not inflate the view count.
    expect(await counterFor(1, '2026-03-01', 'PAGE_VIEW')).toBe(2)
  })

  it('keeps trucks independent', async () => {
    expect(await record(2, '2026-03-01', 'PAGE_VIEW', 'visitor-a')).toBe(true)
    expect(await counterFor(2, '2026-03-01', 'PAGE_VIEW')).toBe(1)
    // Truck 1's number is not affected by anything happening to truck 2.
    expect(await counterFor(1, '2026-03-01', 'PAGE_VIEW')).toBe(2)
  })
})

describe('the totals a driver and the CSV export actually see', () => {
  it('sums across days, not across visitors within a day', async () => {
    // Truck 1 PAGE_VIEW so far: 2026-03-01 → 2 (visitor-a, visitor-b),
    //                           2026-03-02 → 1 (visitor-a again).
    expect(await allTimeTotal(1, 'PAGE_VIEW')).toBe(3)
  })

  it('reports unique visitors as people, not as visits', async () => {
    // The same three events above: visitor-a appears on both days, visitor-b on
    // one. Two distinct people, three visit-days — the exact asymmetry the two
    // dashboard cards are meant to show, and the reason they differ.
    expect(await uniqueVisitors(1, 'PAGE_VIEW', '2026-03-01', '2026-03-31')).toBe(2)
    expect(await allTimeTotal(1, 'PAGE_VIEW')).toBe(3)
  })

  it('windows by date correctly at both ends (BETWEEN is inclusive)', async () => {
    expect(await uniqueVisitors(1, 'PAGE_VIEW', '2026-03-01', '2026-03-01')).toBe(2)
    expect(await uniqueVisitors(1, 'PAGE_VIEW', '2026-03-02', '2026-03-02')).toBe(1)
    expect(await uniqueVisitors(1, 'PAGE_VIEW', '2026-03-03', '2026-03-31')).toBe(0)
  })
})

describe('the constraints the counting relies on actually exist', () => {
  it('rejects a duplicate dedup row outright', async () => {
    await expect(
      db.query(
        `INSERT INTO "AnalyticsVisitorDay" ("towTruckId", "statDate", "eventType", "visitorKey")
         VALUES (1, '2026-03-01'::date, 'PAGE_VIEW'::"AnalyticsEventType", 'visitor-a')`,
      ),
    ).rejects.toThrow()
  })

  it('rejects a second aggregate row for the same (truck, day, event)', async () => {
    await expect(
      db.query(
        `INSERT INTO "AnalyticsDailyStat" ("towTruckId", "statDate", "eventType", "eventCount", "createdAt", "updatedAt")
         VALUES (1, '2026-03-01'::date, 'PAGE_VIEW'::"AnalyticsEventType", 99, now(), now())`,
      ),
    ).rejects.toThrow()
  })

  it('deletes a truck’s statistics with the truck', async () => {
    await seedTruck(3, 'truck-three', '+37411000003')
    await record(3, '2026-03-01', 'PAGE_VIEW', 'visitor-c')
    expect(await counterFor(3, '2026-03-01', 'PAGE_VIEW')).toBe(1)

    await db.query(`DELETE FROM "TowTruck" WHERE id = 3`)

    const { rows } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "AnalyticsDailyStat" WHERE "towTruckId" = 3`,
    )
    expect(rows[0]?.count).toBe(0)
  })
})
