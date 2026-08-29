import { describe, expect, it, vi } from 'vitest'
import { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import type { PrismaService } from '../src/prisma/prisma.service'

/**
 * `findAllForAdmin`'s filters are all plain equality on the raw column —
 * deliberately NOT `buildWhere`'s manipulator/heavy-duty union or its
 * serviceAreas-coverage OR for the public `/tow-trucks` listing. See
 * `AdminTowTrucksQuery`'s own comment for why: every admin card already
 * shows that truck's own `vehicleType`/base labels, so pulling in a truck by
 * a *different* field (a checkbox, or coverage rather than base) would show
 * a card whose own label disagrees with the filter that surfaced it.
 *
 * Prisma is faked rather than connected to — the behaviour under test is
 * which `where` this method builds, not whether Postgres can filter a column.
 */
function fakePrisma() {
  const findMany = vi.fn(async () => [])
  return { prisma: { towTruck: { findMany } } as unknown as PrismaService, findMany }
}

describe('TowTrucksRepository.findAllForAdmin', () => {
  it('sends no where clause when no filter is given', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin({ limit: 50, offset: 0 })

    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: undefined })
  })

  it('filters by plain equality when a vehicleType is given', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 50, offset: 0 },
      { vehicleType: 'manipulator' },
    )

    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { vehicleType: 'manipulator' } })
  })

  it('never widens a single type into the public listing’s union', async () => {
    // If this ever regressed to reuse buildWhere's OR, a flatbed with the
    // `manipulator` checkbox ticked would show up under this filter — the
    // exact card/label mismatch this method exists to avoid.
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 50, offset: 0 },
      { vehicleType: 'manipulator' },
    )

    const where = findMany.mock.calls[0]![0].where
    expect(where).not.toHaveProperty('OR')
    expect(where).not.toHaveProperty('AND')
    expect(where).toEqual({ vehicleType: 'manipulator' })
  })

  it('passes limit/offset through unchanged, same as before this filter existed', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 20, offset: 40 },
      { vehicleType: 'heavy-duty' },
    )

    expect(findMany.mock.calls[0]![0]).toMatchObject({ take: 20, skip: 40 })
  })

  it('filters by regionSlug alone — every driver based anywhere in that marz', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 50, offset: 0 },
      { regionSlug: 'kotayk' },
    )

    expect(findMany.mock.calls[0]![0].where).toEqual({ regionSlug: 'kotayk' })
  })

  it('narrows to one town when citySlug is given alongside regionSlug', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 50, offset: 0 },
      { regionSlug: 'kotayk', citySlug: 'abovyan' },
    )

    expect(findMany.mock.calls[0]![0].where).toEqual({ regionSlug: 'kotayk', citySlug: 'abovyan' })
  })

  it('filters by an exact Yerevan district via districtSlug', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 50, offset: 0 },
      { districtSlug: 'kentron' },
    )

    expect(findMany.mock.calls[0]![0].where).toEqual({ districtSlug: 'kentron' })
  })

  it('filters by "any Yerevan district" via the yerevan flag, with no shared slug to match', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin({ limit: 50, offset: 0 }, { yerevan: true })

    expect(findMany.mock.calls[0]![0].where).toEqual({ districtSlug: { not: null } })
  })

  it('prefers an exact districtSlug over the yerevan flag when both are somehow sent', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 50, offset: 0 },
      { districtSlug: 'kentron', yerevan: true },
    )

    expect(findMany.mock.calls[0]![0].where).toEqual({ districtSlug: 'kentron' })
  })

  it('combines vehicleType with a geography filter as a plain AND, no OR anywhere', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForAdmin(
      { limit: 50, offset: 0 },
      { vehicleType: 'flatbed', regionSlug: 'lori' },
    )

    const where = findMany.mock.calls[0]![0].where
    expect(where).not.toHaveProperty('OR')
    expect(where).toEqual({ vehicleType: 'flatbed', regionSlug: 'lori' })
  })
})
