import { describe, expect, it, vi } from 'vitest'
import { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import type { PrismaService } from '../src/prisma/prisma.service'

/**
 * `findAllForPayments`'s `search` param, in isolation — the `/admin/payments`
 * search box has to work over the whole table (see the method's own comment
 * on why this page stays unpaginated), so what matters here is which `where`
 * this method builds, not whether Postgres can filter a column. Prisma is
 * faked rather than connected to.
 */
function fakePrisma() {
  const findMany = vi.fn(async () => [])
  return { prisma: { towTruck: { findMany } } as unknown as PrismaService, findMany }
}

describe('TowTrucksRepository.findAllForPayments', () => {
  it('sends no where clause when no search is given', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForPayments()

    expect(findMany.mock.calls[0]![0]).toMatchObject({ where: undefined })
  })

  it('matches driver name, company name and phone, name fields case-insensitive', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForPayments('vardan')

    expect(findMany.mock.calls[0]![0].where).toEqual({
      OR: [
        { driverName: { contains: 'vardan', mode: 'insensitive' } },
        { companyName: { contains: 'vardan', mode: 'insensitive' } },
        { phone: { contains: 'vardan' } },
      ],
    })
  })

  it('passes a phone-shaped query straight through as a plain substring match', () => {
    const { prisma, findMany } = fakePrisma()

    void new TowTrucksRepository(prisma).findAllForPayments('+37491000001')

    expect(findMany.mock.calls[0]![0].where.OR).toContainEqual({
      phone: { contains: '+37491000001' },
    })
  })

  it('still sorts by driver name with a search applied', async () => {
    const { prisma, findMany } = fakePrisma()

    await new TowTrucksRepository(prisma).findAllForPayments('anna')

    expect(findMany.mock.calls[0]![0]).toMatchObject({ orderBy: { driverName: 'asc' } })
  })
})
