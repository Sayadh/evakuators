import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Every migration, applied in order, against a real Postgres.
 *
 * ## Why this is different from every other test here
 *
 * Nothing else in this suite touches a database (docs/testing.md), which means
 * nothing else can see the entire class of failure that only exists in SQL: a
 * migration that does not apply, a constraint that does not constrain, a
 * foreign key whose ON DELETE does something other than what the schema comment
 * claims. Those surface on the VPS, during `prisma migrate deploy`, with the
 * app already stopped — the worst possible moment and the worst possible place.
 *
 * PGlite is Postgres itself compiled to WASM, running in-process. This is the
 * real engine executing the real DDL, not a simulation of it, and it needs no
 * server, no container and no credentials — which is why it can run in the same
 * `npm test` as everything else.
 *
 * It deliberately asserts on the things Prisma's schema **cannot** express, and
 * that therefore have no other guard anywhere: the partial unique index, the
 * ON DELETE behaviours, and the absence of a backfill.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations')

let db: PGlite

beforeAll(async () => {
  db = await PGlite.create()

  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // Timestamp-prefixed, so lexical order IS apply order — the same ordering
    // `prisma migrate deploy` uses.
    .sort()

  for (const dir of dirs) {
    const sql = withoutPostgis(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
    if (!sql.trim()) continue

    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`Migration ${dir} failed to apply: ${String(error)}`)
    }
  }
}, 180_000)

/**
 * The one thing this harness cannot execute.
 *
 * PGlite ships without PostGIS, and the nearest-search migration needs it for a
 * generated `geography` column and its GiST index. Rather than skip that
 * migration wholesale — which would also skip whatever ordinary DDL it carries
 * — the three PostGIS-specific statements are removed and everything else in the
 * file still runs.
 *
 * Stated as a limitation rather than hidden: **the PostGIS migration is the one
 * migration this test does not prove.** It is also the one that already carries
 * its own deployment note (it needs a superuser and a host package — see the
 * file), so it was never going to apply unattended anyway. Everything after it
 * is proved, which is the part that matters: a later migration that depended on
 * the spatial column would fail here loudly rather than silently pass.
 */
function withoutPostgis(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS postgis;/gi, '')
    .replace(/^\s*ALTER TABLE[^;]*GENERATED ALWAYS AS[^;]*;/gim, '')
    .replace(/^\s*CREATE INDEX[^;]*USING GIST[^;]*;/gim, '')
}

/** A minimal live truck, so the constraints below have something to hang off */
async function seedTruck(id: number, slug: string, phone: string): Promise<void> {
  await db.query(
    // `updatedAt` is explicit: Prisma's `@updatedAt` is applied by the client,
    // not by a database default, so raw SQL has to supply it. Worth knowing —
    // any hand-written INSERT against these tables (a data fix, a migration
    // that backfills) has the same obligation.
    `INSERT INTO "TowTruck" (id, slug, "driverName", phone, description, "vehicleBrand",
       "vehicleYear", "vehicleType", "capacityTons", "locationName", "serviceAreas",
       services, "updatedAt")
     VALUES ($1, $2, 'Աշոտ', $3, 'նկարագրություն', 'Isuzu', 2018, 'flatbed', 3, 'Աբովյան',
       '[]'::jsonb, ARRAY[]::text[], now())`,
    [id, slug, phone],
  )
}

describe('every migration applies, in order, on an empty database', () => {
  it('produces the tables the app reads', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const tables = rows.map((row) => row.table_name)

    expect(tables).toContain('TowTruck')
    expect(tables).toContain('RegistrationRequest')
    expect(tables).toContain('ProfileChangeRequest')
    expect(tables).toContain('TowTruckImage')
  })

  it('added heavyEquipment without backfilling anyone onto /tsanr-tehnika', async () => {
    // That migration deliberately has no UPDATE. The column stores an admin's
    // own decision, and backfilling `heavy-duty` trucks would have made the
    // decision for them — which a driver could then keep by changing their
    // vehicle type afterwards. See vehicle-types.ts.
    const { rows } = await db.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'TowTruck' AND column_name = 'heavyEquipment'`,
    )
    expect(rows[0]?.column_default).toBe('false')
  })
})

describe('one pending profile change per truck', () => {
  it('is enforced by the database, not only by the service', async () => {
    // `ProfileChangesService` checks first so the message is a sentence. This
    // index is what makes it true under a double submit, where a check-then-
    // write has a race window. Prisma cannot express a partial unique index, so
    // it is hand-written in the migration — and nothing but this test looks at
    // it.
    await seedTruck(1, 'one', '+37491000001')

    await db.query(
      `INSERT INTO "ProfileChangeRequest" ("towTruckId", changes, before)
       VALUES (1, '{"driverName":"A"}'::jsonb, '{"driverName":"B"}'::jsonb)`,
    )

    await expect(
      db.query(
        `INSERT INTO "ProfileChangeRequest" ("towTruckId", changes, before)
         VALUES (1, '{"driverName":"C"}'::jsonb, '{"driverName":"D"}'::jsonb)`,
      ),
    ).rejects.toThrow(/unique/i)
  })

  it('still allows a history of decided requests', async () => {
    // The index is PARTIAL for exactly this reason: APPROVED and REJECTED rows
    // accumulate as history and must be allowed to repeat. A plain unique index
    // would let a driver's profile be edited once, ever.
    await seedTruck(2, 'two', '+37491000002')

    for (const status of ['APPROVED', 'REJECTED', 'APPROVED']) {
      await db.query(
        `INSERT INTO "ProfileChangeRequest" ("towTruckId", status, changes, before)
         VALUES (2, $1::"ProfileChangeStatus", '{}'::jsonb, '{}'::jsonb)`,
        [status],
      )
    }

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) FROM "ProfileChangeRequest" WHERE "towTruckId" = 2`,
    )
    expect(Number(rows[0]!.count)).toBe(3)
  })

  it('lets a driver queue again once the previous one was decided', async () => {
    await db.query(
      `INSERT INTO "ProfileChangeRequest" ("towTruckId", changes, before)
       VALUES (2, '{"driverName":"X"}'::jsonb, '{"driverName":"Y"}'::jsonb)`,
    )

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) FROM "ProfileChangeRequest"
       WHERE "towTruckId" = 2 AND status = 'PENDING'`,
    )
    expect(Number(rows[0]!.count)).toBe(1)
  })
})

describe('a queued photo survives exactly as long as it should', () => {
  async function seedImage(id: number, requestId: number | null): Promise<void> {
    await db.query(
      `INSERT INTO "TowTruckImage" (id, path, url, width, height, "sizeBytes", "profileChangeRequestId")
       VALUES ($1, $2, 'https://example.com/photo.jpg', 100, 100, 1000, $3)`,
      [id, `path-${id}`, requestId],
    )
  }

  it('is released, not deleted, when its request goes away', async () => {
    // SetNull, not Cascade. A superseded edit's photos become ordinary orphans
    // and the nightly purge collects them — the one place that deletes a
    // Storage object and its row in the right order. Cascade would delete the
    // row here and leak the bucket object forever, because `path` is the only
    // record of which object belongs to which row.
    await seedTruck(3, 'three', '+37491000003')
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO "ProfileChangeRequest" ("towTruckId", changes, before)
       VALUES (3, '{"imageIds":[900]}'::jsonb, '{"imageIds":[]}'::jsonb) RETURNING id`,
    )
    const requestId = rows[0]!.id

    await seedImage(900, requestId)
    await db.query(`DELETE FROM "ProfileChangeRequest" WHERE id = $1`, [requestId])

    const after = await db.query<{ profileChangeRequestId: number | null }>(
      `SELECT "profileChangeRequestId" FROM "TowTruckImage" WHERE id = 900`,
    )
    expect(after.rows).toHaveLength(1)
    expect(after.rows[0]!.profileChangeRequestId).toBeNull()
  })

  it('is not claimable by another driver while it waits', async () => {
    // The ownership check in `findUnattachedByIds` is `towTruckId IS NULL AND
    // registrationRequestId IS NULL AND profileChangeRequestId IS NULL`. The
    // third clause is the one that had to be added: a photo sitting in one
    // driver's queued edit satisfies the first two, and an image id is a small
    // sequential integer — so before it, a second driver could name that id in
    // their own save and have it attached to their gallery on approval, while
    // the first driver's edit then failed on a photo that was no longer theirs.
    //
    // Asserted as the query the repository actually runs, against real
    // Postgres, because the property is about a row's visibility rather than
    // about any TypeScript.
    await seedTruck(5, 'five', '+37491000005')
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO "ProfileChangeRequest" ("towTruckId", changes, before)
       VALUES (5, '{"imageIds":[901]}'::jsonb, '{"imageIds":[]}'::jsonb) RETURNING id`,
    )
    const requestId = rows[0]!.id
    await seedImage(901, requestId)
    await seedImage(902, null)

    const claimable = async (allow: number | null) =>
      (
        await db.query<{ id: number }>(
          `SELECT id FROM "TowTruckImage"
           WHERE id = ANY($1) AND "towTruckId" IS NULL AND "registrationRequestId" IS NULL
             AND ("profileChangeRequestId" IS NULL OR "profileChangeRequestId" = $2)`,
          [[901, 902], allow],
        )
      ).rows.map((row) => row.id)

    // Another driver, who passes no allowance: only the genuinely free photo.
    expect(await claimable(null)).toEqual([902])
    // The approval of this very request: its own photo, plus the free one.
    expect((await claimable(requestId)).sort()).toEqual([901, 902])
  })

  it('and the repository really asks that question', () => {
    // The half above proves what the predicate MEANS, against real Postgres.
    // This proves the repository still uses it — and both halves are needed,
    // because deleting the clause from `findUnattachedByIds` leaves the SQL
    // above passing while the application no longer runs it.
    //
    // Source text, not a call, for the reason docs/testing.md gives: nothing
    // here talks to Prisma, and a mocked Prisma would only assert that the
    // object I wrote is the object I wrote.
    const repository = readFileSync(
      join(__dirname, '..', 'src', 'images', 'images.repository.ts'),
      'utf8',
    )
    const claim = repository.slice(
      repository.indexOf('findUnattachedByIds('),
      repository.indexOf('applyGallery('),
    )

    expect(claim).toContain('towTruckId: null')
    expect(claim).toContain('registrationRequestId: null')
    expect(claim).toContain('profileChangeRequestId')
  })

  it('goes away with the truck, which does cascade', async () => {
    // So `AdminService.deleteTowTruck()` needs no extra cleanup step — the
    // claim the schema comment makes.
    await seedTruck(4, 'four', '+37491000004')
    await db.query(
      `INSERT INTO "ProfileChangeRequest" ("towTruckId", changes, before)
       VALUES (4, '{}'::jsonb, '{}'::jsonb)`,
    )

    await db.query(`DELETE FROM "TowTruck" WHERE id = 4`)

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) FROM "ProfileChangeRequest" WHERE "towTruckId" = 4`,
    )
    expect(Number(rows[0]!.count)).toBe(0)
  })
})

describe('DriverPrivacyConsent', () => {
  /** A consent row for a truck, with only the columns a caller must supply */
  const insertForTruck = (towTruckId: number, version = '1.1'): Promise<unknown> =>
    db.query(
      `INSERT INTO "DriverPrivacyConsent" ("towTruckId", "policyVersion", "consentTextHash", source)
       VALUES ($1, $2, $3, 'EXISTING_DRIVER')`,
      [towTruckId, version, 'a'.repeat(64)],
    )

  it('starts empty — nobody was backfilled into consenting', async () => {
    // The single most important assertion about this migration. ~100 drivers
    // were already published when it ran; inventing an `acceptedAt` for any of
    // them would be fabricating the exact evidence the table exists to hold
    // honestly, and would silently satisfy the check that is supposed to put
    // the dialog in front of them.
    //
    // The migration has no INSERT and no UPDATE at all, which is what makes
    // this true — the same argument, and the same test shape, as the
    // heavyEquipment backfill check above.
    const migration = readFileSync(
      join(MIGRATIONS_DIR, '20260820170000_add_driver_privacy_consent', 'migration.sql'),
      'utf8',
    )

    expect(migration).not.toMatch(/INSERT\s+INTO/i)
    expect(migration).not.toMatch(/UPDATE\s+"/i)
  })

  it('requires exactly one owner', async () => {
    await seedTruck(10, 'consent-one', '+37491000010')

    // Neither: an orphan no query would ever find.
    await expect(
      db.query(
        `INSERT INTO "DriverPrivacyConsent" ("policyVersion", "consentTextHash", source)
         VALUES ('1.1', 'a', 'EXISTING_DRIVER')`,
      ),
    ).rejects.toThrow()

    // Both: one act of consenting recorded twice — it would count for the
    // truck AND for the request that produced it.
    await db.query(
      `INSERT INTO "RegistrationRequest" ("firstName", "lastName", phone, "vehicleBrand",
         "vehicleYear", "vehicleType", "capacityRange", "regionSlugs", "citySlugs", services,
         "updatedAt")
       VALUES ('Ա', 'Բ', '+37491000099', 'Isuzu', 2018, 'flatbed', '2-3.5',
         ARRAY['kotayk'], ARRAY['abovyan'], ARRAY['towing'], now())`,
    )
    await expect(
      db.query(
        `INSERT INTO "DriverPrivacyConsent" ("towTruckId", "registrationRequestId",
           "policyVersion", "consentTextHash", source)
         VALUES (10, 1, '1.1', 'a', 'EXISTING_DRIVER')`,
      ),
    ).rejects.toThrow()
  })

  it('allows only one LIVE consent per truck and version', async () => {
    await seedTruck(11, 'consent-two', '+37491000011')
    await insertForTruck(11)

    // The service checks first so it can answer idempotently with a friendly
    // result; this index is what makes the rule hold under a double-tapped
    // button, where a check-then-write has a race window.
    await expect(insertForTruck(11)).rejects.toThrow()
  })

  it('frees the slot once the consent is withdrawn', async () => {
    await seedTruck(12, 'consent-three', '+37491000012')
    await insertForTruck(12)
    await db.query(`UPDATE "DriverPrivacyConsent" SET "revokedAt" = now() WHERE "towTruckId" = 12`)

    // Partial on `revokedAt IS NULL`, so consenting again after a withdrawal is
    // a legitimate second row — and BOTH stay in the history, which is the
    // whole point of never deleting.
    await expect(insertForTruck(12)).resolves.toBeDefined()

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) FROM "DriverPrivacyConsent" WHERE "towTruckId" = 12`,
    )
    expect(Number(rows[0]!.count)).toBe(2)
  })

  it('treats a new policy version as a separate slot', async () => {
    // The re-consent mechanism: bumping PRIVACY_POLICY_VERSION must not collide
    // with the row the driver already has at the old version.
    await seedTruck(13, 'consent-four', '+37491000013')
    await insertForTruck(13, '1.1')

    await expect(insertForTruck(13, '1.2')).resolves.toBeDefined()
  })

  it('goes away with the truck', async () => {
    // Deleting a driver deletes their consent history with them: keeping it
    // would mean retaining personal data about someone whose whole point in
    // being deleted was that we stop.
    await seedTruck(14, 'consent-five', '+37491000014')
    await insertForTruck(14)

    await db.query(`DELETE FROM "TowTruck" WHERE id = 14`)

    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) FROM "DriverPrivacyConsent" WHERE "towTruckId" = 14`,
    )
    expect(Number(rows[0]!.count)).toBe(0)
  })
})
