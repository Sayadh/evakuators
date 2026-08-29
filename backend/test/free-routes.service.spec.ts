import 'reflect-metadata'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { FreeRoutesService } from '../src/free-routes/free-routes.service'

/**
 * `estimatedArrivalAt` is now the field that decides auto-expiry (see
 * schema.prisma's own comment on the column), not `departureAt` — a route
 * stays findable for the whole trip, not just until the driver sets off. The
 * property worth pinning here is the one the docs already tell a war story
 * about for the OLD departureAt-based version of this exact check: reactivate
 * unconditionally, and a driver fixing a typo watches their route vanish a
 * cron tick later. These pin the NEW deadline field instead.
 *
 * Hand-rolled FreeRoutesService with only the two collaborators `update()`/
 * `create()` touch mocked — same pattern as admin-heavy-equipment.spec.ts.
 */
function buildService(existing: {
  id: number
  towTruckId: number
  departureAt: Date
  estimatedArrivalAt: Date | null
} | null) {
  // toMyFreeRouteApi() reads every field off whatever these resolve to, so
  // the mock must return a full route shape (createdAt included), not just
  // an echo of the id/data the service passed in.
  const routeDefaults = {
    startRegionSlug: 'a',
    startCitySlug: 'b',
    endRegionSlug: 'c',
    endCitySlug: 'd',
    description: null,
    status: 'ACTIVE',
    createdAt: new Date(),
  }
  const update = vi.fn((id: number, data: unknown) =>
    Promise.resolve({ id, towTruckId: 1, ...routeDefaults, ...(data as object) }),
  )
  const create = vi.fn((towTruckId: number, data: unknown) =>
    Promise.resolve({ id: 1, towTruckId, ...routeDefaults, ...(data as object) }),
  )
  const freeRoutesRepository = {
    findById: vi.fn(() => Promise.resolve(existing)),
    update,
    create,
  }
  const towTrucksRepository = {
    findStatusById: vi.fn(() => Promise.resolve({ id: 1, isActive: true })),
    findContactById: vi.fn(() => Promise.resolve(null)),
  }
  const adminNotification = { notifyNewFreeRoute: vi.fn(() => Promise.resolve()) }

  const service = new FreeRoutesService(
    freeRoutesRepository as never,
    towTrucksRepository as never,
    adminNotification as never,
  )

  return { service, update, create, towTrucksRepository }
}

const FUTURE_DEPARTURE = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
const FUTURE_ARRIVAL = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()

describe('FreeRoutesService.create', () => {
  it('accepts an arrival after departure', async () => {
    const { service, create } = buildService(null)

    await service.create(1, {
      startRegionSlug: 'a',
      startCitySlug: 'b',
      endRegionSlug: 'c',
      endCitySlug: 'd',
      departureAt: FUTURE_DEPARTURE,
      estimatedArrivalAt: FUTURE_ARRIVAL,
    })

    expect(create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ estimatedArrivalAt: new Date(FUTURE_ARRIVAL) }),
    )
  })

  it('rejects an arrival at or before departure', async () => {
    const { service } = buildService(null)

    await expect(
      service.create(1, {
        startRegionSlug: 'a',
        startCitySlug: 'b',
        endRegionSlug: 'c',
        endCitySlug: 'd',
        departureAt: FUTURE_DEPARTURE,
        estimatedArrivalAt: FUTURE_DEPARTURE, // same instant — not "after"
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('still rejects a departure that is not in the future — unchanged from before', async () => {
    const { service } = buildService(null)
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    await expect(
      service.create(1, {
        startRegionSlug: 'a',
        startCitySlug: 'b',
        endRegionSlug: 'c',
        endCitySlug: 'd',
        departureAt: past,
        estimatedArrivalAt: FUTURE_ARRIVAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('FreeRoutesService.update — reactivation deadline', () => {
  it('allows a departureAt in the past as long as estimatedArrivalAt is still future', async () => {
    // The case the arrival range exists for: the driver is already en route.
    const departedAnHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const { service, update } = buildService({
      id: 5,
      towTruckId: 1,
      departureAt: departedAnHourAgo,
      estimatedArrivalAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    await service.update(1, 5, { description: 'typo fix' })

    expect(update).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ status: 'ACTIVE', departureAt: departedAnHourAgo }),
    )
  })

  it('rejects reactivation once estimatedArrivalAt itself has passed', async () => {
    const { service } = buildService({
      id: 6,
      towTruckId: 1,
      departureAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      estimatedArrivalAt: new Date(Date.now() - 60 * 60 * 1000),
    })

    await expect(service.update(1, 6, { description: 'typo fix' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('falls back to departureAt when the existing row predates this column (null)', async () => {
    // A route posted before estimatedArrivalAt existed. Still governed by the
    // rule it replaced: departureAt must be future for the edit to reactivate.
    const { service } = buildService({
      id: 7,
      towTruckId: 1,
      departureAt: new Date(Date.now() - 60 * 60 * 1000),
      estimatedArrivalAt: null,
    })

    await expect(service.update(1, 7, { description: 'typo fix' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('re-validates arrival-after-departure when departureAt itself is being pushed later', async () => {
    const { service } = buildService({
      id: 8,
      towTruckId: 1,
      departureAt: new Date(Date.now() + 60 * 60 * 1000),
      estimatedArrivalAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    })

    // Moving departure to 3h from now, past the existing (unset) arrival —
    // rejected rather than silently stored as an arrival-before-departure.
    await expect(
      service.update(1, 8, {
        departureAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('404s for a route that does not exist', async () => {
    const { service } = buildService(null)
    await expect(service.update(1, 99, {})).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses a deactivated driver, same as before', async () => {
    const { service, towTrucksRepository } = buildService({
      id: 5,
      towTruckId: 1,
      departureAt: new Date(Date.now() + 60 * 60 * 1000),
      estimatedArrivalAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    })
    towTrucksRepository.findStatusById = vi.fn(() => Promise.resolve({ id: 1, isActive: false }))

    await expect(service.update(1, 5, {})).rejects.toBeInstanceOf(ForbiddenException)
  })
})
