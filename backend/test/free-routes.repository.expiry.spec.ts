import { FreeRouteStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaService } from '../src/prisma/prisma.service'
import { FreeRoutesRepository } from '../src/free-routes/free-routes.repository'

/**
 * Both cron queries key off `estimatedArrivalAt` first, falling back to
 * `departureAt` only for a row written before that column existed
 * (`estimatedArrivalAt IS NULL`). Prisma is faked rather than connected to —
 * the behaviour under test is which `where` these methods build, not
 * whether Postgres can filter a column. See the repository's own comments
 * on `markExpiredAsFinished`/`deleteFinishedBefore` for why the fallback
 * has to be an OR rather than a plain `estimatedArrivalAt ?? departureAt`
 * swap at the call site.
 */
function fakePrisma() {
  const updateMany = vi.fn(async () => ({ count: 3 }))
  const deleteMany = vi.fn(async () => ({ count: 2 }))
  return {
    prisma: { freeRoute: { updateMany, deleteMany } } as unknown as PrismaService,
    updateMany,
    deleteMany,
  }
}

describe('FreeRoutesRepository.markExpiredAsFinished', () => {
  it('flips ACTIVE routes to FINISHED once estimatedArrivalAt has passed, falling back to departureAt only when it is null', async () => {
    const { prisma, updateMany } = fakePrisma()
    const now = new Date('2026-08-29T12:00:00.000Z')

    const count = await new FreeRoutesRepository(prisma).markExpiredAsFinished(now)

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: FreeRouteStatus.ACTIVE,
        OR: [{ estimatedArrivalAt: { lte: now } }, { estimatedArrivalAt: null, departureAt: { lte: now } }],
      },
      data: { status: FreeRouteStatus.FINISHED },
    })
    expect(count).toBe(3)
  })
})

describe('FreeRoutesRepository.deleteFinishedBefore', () => {
  it('hard-deletes FINISHED routes past the grace cutoff, same estimatedArrivalAt-first/departureAt-fallback shape', async () => {
    const { prisma, deleteMany } = fakePrisma()
    const cutoff = new Date('2026-08-28T12:00:00.000Z')

    const count = await new FreeRoutesRepository(prisma).deleteFinishedBefore(cutoff)

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        status: FreeRouteStatus.FINISHED,
        OR: [{ estimatedArrivalAt: { lte: cutoff } }, { estimatedArrivalAt: null, departureAt: { lte: cutoff } }],
      },
    })
    expect(count).toBe(2)
  })
})
