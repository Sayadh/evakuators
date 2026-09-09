import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'
import { FEATURED_MAX_DAYS, FEATURED_MIN_DAYS } from '../src/tow-trucks/featured'

/**
 * Granting, revoking and expiring a paid placement.
 *
 * Constructed directly with a hand-built repository, the house pattern for this
 * suite — see docs/testing.md on why there is no `@nestjs/testing` here.
 */

function service(overrides: Record<string, unknown> = {}) {
  const setFeatured = vi.fn(async (id: number, window: unknown) => ({
    id,
    isFeatured: window !== null,
    featuredUntil: (window as { until?: Date } | null)?.until ?? null,
  }))
  const expire = vi.fn(async () => 3)

  const repository = {
    findById: vi.fn(async (id: number) => ({ id })),
    setFeatured,
    expireFeatured: expire,
    ...overrides,
  }

  const instance = Object.create(AdminService.prototype) as AdminService
  Object.assign(instance, {
    towTrucksRepository: repository,
    logger: { log: vi.fn(), warn: vi.fn() },
  })

  return { instance, repository, setFeatured, expire }
}

describe('AdminService.setTowTruckFeatured', () => {
  it('records a window counted from now', async () => {
    const { instance, setFeatured } = service()
    const before = Date.now()

    const result = await instance.setTowTruckFeatured(7, true, 3)

    const [, window] = setFeatured.mock.calls[0]!
    const { at, until } = window as { at: Date; until: Date }
    expect(at.getTime()).toBeGreaterThanOrEqual(before)
    expect(until.getTime() - at.getTime()).toBe(3 * 24 * 60 * 60 * 1000)
    expect(result.isFeatured).toBe(true)
    expect(result.featuredUntil).toBe(until.toISOString())
  })

  it('rewrites the start on a re-grant, so a renewal goes to the front of the queue', async () => {
    // Not idempotent on purpose: `featuredAt` IS the ordering, and a driver who
    // has just paid again belongs ahead of one who bought later during their
    // first term.
    const { instance, setFeatured } = service()
    await instance.setTowTruckFeatured(7, true, 5)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await instance.setTowTruckFeatured(7, true, 5)

    const first = (setFeatured.mock.calls[0]![1] as { at: Date }).at
    const second = (setFeatured.mock.calls[1]![1] as { at: Date }).at
    expect(second.getTime()).toBeGreaterThan(first.getTime())
  })

  it('clears both dates when the placement is revoked', async () => {
    // A row reading `isFeatured: false` with a live end date means nothing, and
    // would come back to life if anyone re-granted the flag alone.
    const { instance, setFeatured } = service()
    await instance.setTowTruckFeatured(7, false)
    expect(setFeatured).toHaveBeenCalledWith(7, null)
  })

  it('refuses a duration outside what the product sells', async () => {
    const { instance, setFeatured } = service()
    for (const days of [0, -1, 1.5, FEATURED_MAX_DAYS + 1, undefined]) {
      await expect(instance.setTowTruckFeatured(7, true, days)).rejects.toThrow()
    }
    expect(setFeatured).not.toHaveBeenCalled()
  })

  it('accepts both ends of the range', async () => {
    const { instance } = service()
    await expect(instance.setTowTruckFeatured(7, true, FEATURED_MIN_DAYS)).resolves.toBeDefined()
    await expect(instance.setTowTruckFeatured(7, true, FEATURED_MAX_DAYS)).resolves.toBeDefined()
  })

  it('refuses a driver that does not exist before writing anything', async () => {
    const { instance, setFeatured } = service({ findById: vi.fn(async () => null) })
    await expect(instance.setTowTruckFeatured(7, true, 3)).rejects.toThrow()
    expect(setFeatured).not.toHaveBeenCalled()
  })
})

describe('AdminService.expireFeatured', () => {
  it('sweeps with a single instant', async () => {
    const { instance, expire } = service()
    await instance.expireFeatured()
    expect(expire).toHaveBeenCalledTimes(1)
    expect(expire.mock.calls[0]![0]).toBeInstanceOf(Date)
  })
})
