import 'reflect-metadata'
import { PGlite } from '@electric-sql/pglite'
import { plainToInstance } from 'class-transformer'
import { beforeAll, describe, expect, it } from 'vitest'
import { UpdateMyTowTruckDto } from '../src/my-tow-truck/dto/update-my-tow-truck.dto'
import { diffProfile, isEmptyDiff } from '../src/profile-changes/profile-change-diff'

/**
 * The diff, against a value that has actually been through Postgres.
 *
 * ## The bug this exists for
 *
 * A driver pressed save on their dashboard without changing anything, and the
 * moderation queue filled up with «Սպասարկվող տարածքներ:
 * Սևան, Գավառ, Մարտունի → Սևան, Գավառ, Մարտունի». Every save. A change with
 * nothing in it to approve, and a driver who could not correct a phone number
 * without dragging their whole coverage list through review with it.
 *
 * The comparison used `JSON.stringify` on both sides. That is exact for two
 * objects built in the same order, and `TowTruck.serviceAreas` is a **`jsonb`**
 * column: jsonb does not preserve key order, it stores keys sorted by length
 * and then bytewise. `{slug, name, type}` goes in and `{name, slug, type}`
 * comes out, so the text never matched and the values always did.
 *
 * ## Why it takes a database to see
 *
 * Every unit test in this feature builds both sides in JavaScript, in the same
 * order, and passes. So does a mocked Prisma — a mock returns the object it was
 * handed. The reordering is done by Postgres and by nothing else, which is why
 * this file drives a real one (PGlite, in-process; see
 * `migrations.pglite.spec.ts` for the same reasoning).
 */

let db: PGlite

/** What the frontend builds and sends — `{slug, name, type}`, in that order */
const SUBMITTED_AREAS = [
  { slug: 'sevan', name: 'Սևան', type: 'city' },
  { slug: 'gavar', name: 'Գավառ', type: 'city' },
  { slug: 'martuni', name: 'Մարտունի', type: 'city' },
]

/** The same coverage, after a round trip through a jsonb column */
let storedAreas: unknown

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(`CREATE TABLE coverage (id int primary key, areas jsonb)`)
  await db.query(`INSERT INTO coverage VALUES (1, $1::jsonb)`, [JSON.stringify(SUBMITTED_AREAS)])

  const { rows } = await db.query<{ areas: unknown }>(`SELECT areas FROM coverage WHERE id = 1`)
  storedAreas = rows[0]!.areas
}, 120_000)

/** The DTO instance the ValidationPipe hands the service, not a bare literal */
function submitted(areas: unknown): Record<string, unknown> {
  return plainToInstance(UpdateMyTowTruckDto, {
    serviceAreas: JSON.parse(JSON.stringify(areas)),
    regionSlugs: ['gegharkunik'],
  }) as unknown as Record<string, unknown>
}

describe('jsonb really does reorder the keys', () => {
  it('gives back the same fields in a different order', () => {
    // Stated as its own test because the rest of the file is meaningless if
    // this ever stops being true — and if Postgres changed it, the fix below
    // would look like dead weight to whoever read it next.
    expect(storedAreas).toEqual(SUBMITTED_AREAS)
    expect(JSON.stringify(storedAreas)).not.toBe(JSON.stringify(SUBMITTED_AREAS))
    expect(Object.keys((storedAreas as Record<string, unknown>[])[0]!)).toEqual([
      'name',
      'slug',
      'type',
    ])
  })
})

describe('an untouched save produces no change', () => {
  it('does not queue a phantom coverage edit', () => {
    // The regression, end to end: the exact array the dashboard rebuilds,
    // against the exact value Postgres returns.
    const diff = diffProfile(submitted(SUBMITTED_AREAS), { serviceAreas: storedAreas })

    expect(isEmptyDiff(diff)).toBe(true)
    expect(Object.keys(diff.before)).toEqual([])
  })
})

describe('a real coverage edit is still caught', () => {
  it('sees an added area', () => {
    const diff = diffProfile(
      submitted([...SUBMITTED_AREAS, { slug: 'vardenis', name: 'Վարդենիս', type: 'city' }]),
      { serviceAreas: storedAreas },
    )
    expect(Object.keys(diff.before)).toEqual(['serviceAreas'])
  })

  it('sees a removed area', () => {
    const diff = diffProfile(submitted(SUBMITTED_AREAS.slice(0, 2)), {
      serviceAreas: storedAreas,
    })
    expect(Object.keys(diff.before)).toEqual(['serviceAreas'])
  })

  it('sees a reorder, which changes the order they are listed in', () => {
    const reordered = [SUBMITTED_AREAS[2]!, SUBMITTED_AREAS[0]!, SUBMITTED_AREAS[1]!]
    const diff = diffProfile(submitted(reordered), { serviceAreas: storedAreas })
    expect(Object.keys(diff.before)).toEqual(['serviceAreas'])
  })

  it('sees a renamed area, even though the slug is the same', () => {
    // The name is what a public profile shows, and the backend cannot rebuild
    // it (no geography) — so a different name is a real change to review, not a
    // normalisation artefact.
    const renamed = [{ ...SUBMITTED_AREAS[0]!, name: 'Սևան քաղաք' }, ...SUBMITTED_AREAS.slice(1)]
    const diff = diffProfile(submitted(renamed), { serviceAreas: storedAreas })
    expect(Object.keys(diff.before)).toEqual(['serviceAreas'])
  })

  it('sees a type change, which decides which page the area matches on', () => {
    const retyped = [{ ...SUBMITTED_AREAS[0]!, type: 'route' }, ...SUBMITTED_AREAS.slice(1)]
    const diff = diffProfile(submitted(retyped), { serviceAreas: storedAreas })
    expect(Object.keys(diff.before)).toEqual(['serviceAreas'])
  })
})
