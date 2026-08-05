import { describe, expect, it, vi } from 'vitest'
import { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import type { PrismaService } from '../src/prisma/prisma.service'

/**
 * `countForAdmin()` is the only thing behind the admin panel's headline
 * "how many drivers do we have" number, and it is the one place in the codebase
 * where a count is DERIVED rather than queried. These tests pin both.
 *
 * Prisma is faked rather than connected to: the behaviour under test is the
 * arithmetic and the shape of the two queries, neither of which needs Postgres
 * to have an opinion. A real database here would test Prisma, not us.
 */

/** A `PrismaService` with only what the method under test reaches for */
function fakePrisma(counts: { total: number; active: number }) {
  const count = vi.fn(async (args?: { where?: { isActive?: boolean } }) =>
    args?.where === undefined ? counts.total : counts.active,
  )
  return { prisma: { towTruck: { count } } as unknown as PrismaService, count }
}

describe('TowTrucksRepository.countForAdmin', () => {
  it('reports the total, the active count, and inactive as the difference', async () => {
    const { prisma } = fakePrisma({ total: 46, active: 41 })

    await expect(new TowTrucksRepository(prisma).countForAdmin()).resolves.toEqual({
      total: 46,
      active: 41,
      inactive: 5,
    })
  })

  /**
   * The guarantee the admin header depends on. `inactive` is computed, never
   * counted, precisely so it cannot disagree with the two numbers shown beside
   * it — a third `count()` would be a third snapshot of a table that another
   * admin may be writing to at the same moment.
   */
  it('always adds up, whatever the numbers are', async () => {
    for (const [total, active] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [46, 41],
      [1000, 3],
    ]) {
      const { prisma } = fakePrisma({ total: total!, active: active! })
      const result = await new TowTrucksRepository(prisma).countForAdmin()
      expect(result.active + result.inactive).toBe(result.total)
      expect(result.inactive).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * The total must count EVERY truck. A `where` clause slipping onto the first
   * query — the natural way to break this while "tidying up" — would silently
   * turn the headline number into the active count, and the header would then
   * read "41 · ակտիվ՝ 41 · ապաակտիվացված՝ 0" with five deactivated trucks
   * sitting in the table.
   */
  it('counts the whole table for the total and filters only the active query', async () => {
    const { prisma, count } = fakePrisma({ total: 46, active: 41 })

    await new TowTrucksRepository(prisma).countForAdmin()

    expect(count).toHaveBeenCalledTimes(2)
    expect(count.mock.calls[0]![0]).toBeUndefined()
    expect(count.mock.calls[1]![0]).toEqual({ where: { isActive: true } })
  })

  /**
   * Two independent counts, issued together. Sequential awaits would double the
   * latency of a number rendered on every admin page load for no benefit.
   */
  it('issues the two counts concurrently', async () => {
    let inFlight = 0
    let peak = 0
    const prisma = {
      towTruck: {
        count: async () => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 5))
          inFlight -= 1
          return 0
        },
      },
    } as unknown as PrismaService

    await new TowTrucksRepository(prisma).countForAdmin()

    expect(peak).toBe(2)
  })
})
