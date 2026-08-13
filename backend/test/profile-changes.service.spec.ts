import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ProfileChangesService } from '../src/profile-changes/profile-changes.service'

/**
 * The queue itself: what queuing does, and what approving does.
 *
 * The single most important property here is that **approval runs the driver's
 * own write path**. `MyTowTruckService.applyUpdate` is the code that used to
 * run when a dashboard save went straight to the database; if an approval ever
 * re-implemented that write, an approved edit would be stored differently from
 * the same edit written directly — different `manipulator` derivation,
 * different meaning for an empty string, different coverage check — and the
 * difference would only show up in production data.
 */

const TRUCK = {
  id: 7,
  driverName: 'Աշոտ Աշոտյան',
  companyName: null,
  secondaryPhone: null,
  whatsapp: null,
  telegram: null,
  email: null,
  vehicleBrand: 'Isuzu',
  vehicleModel: null,
  vehicleYear: 2018,
  vehicleType: 'flatbed',
  capacityTons: 3,
  platformLengthM: null,
  platformWidthM: null,
  winch: true,
  manipulator: false,
  wheelSkates: false,
  description: 'Հին նկարագրություն',
  services: ['towing'],
  workingHoursText: null,
  locationName: 'Աբովյան',
  serviceAreas: [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }],
  regionSlug: 'kotayk',
  citySlug: 'abovyan',
  districtSlug: null,
  priceCityCallout: null,
  pricePerKm: null,
  priceWaitingPerHour: null,
  priceNightSurchargePercent: null,
  priceExtraLoading: null,
  latitude: null,
  longitude: null,
  telegramChatId: 555n,
  images: [{ id: 1 }, { id: 2 }],
}

function build(overrides: { pending?: unknown; findById?: unknown } = {}) {
  const replacePending = vi.fn((towTruckId: number, changes: unknown, before: unknown) =>
    Promise.resolve({ id: 99, towTruckId, changes, before, status: 'PENDING' }),
  )
  const markReviewed = vi.fn(() => Promise.resolve({}))
  const deletePending = vi.fn(() => Promise.resolve(1))

  const repository = {
    replacePending,
    markReviewed,
    deletePending,
    findPendingForTruck: vi.fn(() => Promise.resolve(overrides.pending ?? null)),
    findLastReviewedForTruck: vi.fn(() => Promise.resolve(null)),
    findById: vi.fn(() =>
      Promise.resolve(
        overrides.findById ?? {
          id: 99,
          towTruckId: 7,
          status: 'PENDING',
          changes: {},
          before: {},
          towTruck: { id: 7, slug: 'ashot', driverName: 'Աշոտ', companyName: null },
        },
      ),
    ),
    countPending: vi.fn(() => Promise.resolve(0)),
  }

  const towTrucksRepository = { findById: vi.fn(() => Promise.resolve(TRUCK)) }

  const applyUpdate = vi.fn(() => Promise.resolve({}))
  const applyCoordinates = vi.fn(() => Promise.resolve({}))
  const myTowTruck = { getMine: vi.fn(() => Promise.resolve({})), applyUpdate, applyCoordinates }

  const telegram = { sendMessage: vi.fn(() => Promise.resolve(true)) }

  const service = new ProfileChangesService(
    repository as never,
    towTrucksRepository as never,
    myTowTruck as never,
    telegram as never,
  )

  return { service, replacePending, markReviewed, deletePending, applyUpdate, applyCoordinates, telegram, repository }
}

describe('queuing an edit', () => {
  it('stores only the fields that differ', async () => {
    const { service, replacePending } = build()

    await service.submitProfileChange(7, {
      driverName: 'Աշոտ Ուղղված',
      vehicleBrand: 'Isuzu',
      description: 'Հին նկարագրություն',
    } as never)

    expect(replacePending.mock.calls[0]![1]).toEqual({ driverName: 'Աշոտ Ուղղված' })
    expect(replacePending.mock.calls[0]![2]).toEqual({ driverName: 'Աշոտ Աշոտյան' })
  })

  it('queues nothing when the form was submitted untouched', async () => {
    // The dashboard submits every field on every save, so this is the commonest
    // save there is — and it must not put an empty entry in front of a moderator.
    const { service, replacePending } = build()

    const result = await service.submitProfileChange(7, {
      driverName: 'Աշոտ Աշոտյան',
      vehicleBrand: 'Isuzu',
      description: 'Հին նկարագրություն',
    } as never)

    expect(result).toBeNull()
    expect(replacePending).not.toHaveBeenCalled()
  })

  it('claims only the photos that are new, so an existing one keeps its owner', async () => {
    const { service, replacePending } = build()

    await service.submitProfileChange(7, { imageIds: [1, 2, 9] } as never)

    expect(replacePending.mock.calls[0]![3]).toEqual([9])
  })

  it('routes the coordinate dialog through the same queue', async () => {
    // Otherwise «where I am parked» would be the one public claim a driver
    // could still change unreviewed, and therefore the way around the queue.
    const { service, replacePending, applyCoordinates } = build()

    await service.submitCoordinatesChange(7, { latitude: 40.2, longitude: 44.5 } as never)

    expect(applyCoordinates).not.toHaveBeenCalled()
    expect(replacePending.mock.calls[0]![1]).toEqual({ latitude: 40.2, longitude: 44.5 })
  })

  it('refuses a deactivated driver, like the direct write did', async () => {
    // `getMine` is the existence + isActive check, and it is reused rather than
    // repeated: a deactivated driver holding a still-valid 30-day token must
    // not be able to queue an edit either.
    const blocked = new ProfileChangesService(
      {} as never,
      {} as never,
      { getMine: vi.fn(() => Promise.reject(new NotFoundException())) } as never,
      {} as never,
    )

    await expect(blocked.submitProfileChange(7, {} as never)).rejects.toThrow(NotFoundException)
    await expect(blocked.withdraw(7)).rejects.toThrow(NotFoundException)
  })
})

describe('approving an edit', () => {
  it("applies it through the driver's own write path", async () => {
    // Not through a second implementation. Anything else would derive
    // `manipulator`, read an empty string and check coverage differently from a
    // direct save, and the difference would only appear in stored data.
    const { service, applyUpdate, markReviewed } = build({
      findById: {
        id: 99,
        towTruckId: 7,
        status: 'PENDING',
        changes: { driverName: 'Աշոտ Ուղղված', services: ['towing', 'available-24-7'] },
        before: {},
        towTruck: { id: 7, slug: 'ashot', driverName: 'Աշոտ', companyName: null },
      },
    })

    await service.approve(99)

    expect(applyUpdate).toHaveBeenCalledWith(7, {
      driverName: 'Աշոտ Ուղղված',
      services: ['towing', 'available-24-7'],
    })
    expect(markReviewed.mock.calls[0]![1]).toBe('APPROVED')
  })

  it('writes the coordinate pair through the coordinate path', async () => {
    // So the Armenia bounds check and the locationUpdatedAt stamp are the same
    // ones a direct save produced.
    const { service, applyUpdate, applyCoordinates } = build({
      findById: {
        id: 99,
        towTruckId: 7,
        status: 'PENDING',
        changes: { latitude: 40.2, longitude: 44.5 },
        before: {},
        towTruck: { id: 7, slug: 'ashot', driverName: 'Աշոտ', companyName: null },
      },
    })

    await service.approve(99)

    expect(applyCoordinates).toHaveBeenCalledWith(7, { latitude: 40.2, longitude: 44.5 })
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('marks the request reviewed only after the write succeeded', async () => {
    // The other order leaves a request marked applied that never was, with
    // nothing on the row to tell which happened.
    const { service, markReviewed } = build({
      findById: {
        id: 99,
        towTruckId: 7,
        status: 'PENDING',
        changes: { driverName: 'Աշոտ Ուղղված' },
        before: {},
        towTruck: { id: 7, slug: 'ashot', driverName: 'Աշոտ', companyName: null },
      },
    })

    const failing = new ProfileChangesService(
      { findById: () => Promise.resolve({ id: 99, towTruckId: 7, status: 'PENDING', changes: { driverName: 'x' }, before: {}, towTruck: {} }), markReviewed } as never,
      { findById: () => Promise.resolve(TRUCK) } as never,
      { applyUpdate: () => Promise.reject(new BadRequestException('նկարը վավեր չէ')) } as never,
      { sendMessage: vi.fn() } as never,
    )

    await expect(failing.approve(99)).rejects.toThrow(BadRequestException)
    expect(markReviewed).not.toHaveBeenCalled()

    await service.approve(99)
    expect(markReviewed).toHaveBeenCalledTimes(1)
  })

  it('refuses to act twice on the same request', async () => {
    const { service } = build({
      findById: {
        id: 99,
        towTruckId: 7,
        status: 'APPROVED',
        changes: {},
        before: {},
        towTruck: {},
      },
    })

    await expect(service.approve(99)).rejects.toThrow(BadRequestException)
    await expect(service.reject(99, 'պատճառը բավական երկար է')).rejects.toThrow(BadRequestException)
  })

  it('tells the driver, and does not fail the decision if Telegram is down', async () => {
    // The decision is already written. Reporting it as failed would offer the
    // panel a retry for something that cannot be repeated.
    const markReviewed = vi.fn(() => Promise.resolve({}))
    const service = new ProfileChangesService(
      {
        findById: () =>
          Promise.resolve({ id: 99, towTruckId: 7, status: 'PENDING', changes: {}, before: {}, towTruck: {} }),
        markReviewed,
      } as never,
      { findById: () => Promise.reject(new Error('db down')) } as never,
      { applyUpdate: vi.fn() } as never,
      { sendMessage: vi.fn() } as never,
    )

    await expect(service.approve(99)).resolves.toEqual({ id: 99 })
    expect(markReviewed).toHaveBeenCalled()
  })
})

describe('rejecting an edit', () => {
  it('stores the reason and sends it to the driver verbatim', async () => {
    const { service, markReviewed, telegram } = build()

    await service.reject(99, '  Նկարը մշուշոտ է  ')

    expect(markReviewed.mock.calls[0]![1]).toBe('REJECTED')
    expect(markReviewed.mock.calls[0]![2]).toBe('Նկարը մշուշոտ է')
    expect(telegram.sendMessage.mock.calls[0]![1]).toContain('Նկարը մշուշոտ է')
  })

  it('never writes anything to the profile', async () => {
    const { service, applyUpdate, applyCoordinates } = build()

    await service.reject(99, 'Պատճառը բավական երկար է')

    expect(applyUpdate).not.toHaveBeenCalled()
    expect(applyCoordinates).not.toHaveBeenCalled()
  })
})

describe('what the driver sees', () => {
  it('hides an old rejection while a new attempt is waiting', async () => {
    // It would otherwise read as a verdict on the edit currently in the queue.
    const { service, repository } = build({ pending: { id: 100 } })

    const status = await service.getStatusForDriver(7)

    expect(status.pending).toEqual({ id: 100 })
    expect(status.lastReviewed).toBeNull()
    expect(repository.findLastReviewedForTruck).not.toHaveBeenCalled()
  })
})
