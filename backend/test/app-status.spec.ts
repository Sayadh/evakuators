import { afterEach, describe, expect, it, vi } from 'vitest'
import { appStatusEnabled, appStatusOf, type AppPresenceRow } from '../src/tow-trucks/app-status'
import type { ReviewsRepository } from '../src/reviews/reviews.repository'
import type { TowTrucksRepository } from '../src/tow-trucks/tow-trucks.repository'
import { TowTrucksService } from '../src/tow-trucks/tow-trucks.service'

const online: AppPresenceRow = {
  towTruckId: 1,
  wantsOnline: true,
  externalBusy: false,
  suspended: false,
  onOrder: false,
  silentTooLong: false,
}

describe('appStatusOf', () => {
  it.each<[string, Partial<AppPresenceRow>, 'FREE' | 'BUSY' | null]>([
    ['Online and free', {}, 'FREE'],
    ['on an active order', { onOrder: true }, 'BUSY'],
    ['on an order even if he pressed Offline', { onOrder: true, wantsOnline: false }, 'BUSY'],
    ['marked busy outside the app', { externalBusy: true }, 'BUSY'],
    ['Offline', { wantsOnline: false }, null],
    ['Offline and marked busy', { wantsOnline: false, externalBusy: true }, null],
    ['silent for over a week', { silentTooLong: true }, null],
    ['blocked by an operator', { suspended: true, onOrder: true }, null],
  ])('%s', (_label, patch, expected) => {
    expect(appStatusOf({ ...online, ...patch })).toBe(expected)
  })
})

describe('appStatusEnabled', () => {
  it('follows LIVE_DISPATCH_ENABLED', () => {
    expect(appStatusEnabled({ LIVE_DISPATCH_ENABLED: 'true' })).toBe(true)
    expect(appStatusEnabled({ LIVE_DISPATCH_ENABLED: 'false' })).toBe(false)
    expect(appStatusEnabled({})).toBe(false)
  })
})

describe('TowTrucksService app status on cards', () => {
  const card = (id: number) => ({
    id,
    slug: `t${id}`,
    driverName: `D${id}`,
    companyName: null,
    phone: '+37491000000',
    works24Hours: true,
    workingHoursText: null,
    priceCityCallout: 5000,
    vehicleBrand: 'Ford',
    vehicleModel: 'Transit',
    vehicleType: 'flatbed',
    capacityTons: 3.5,
    manipulator: false,
    wheelSkates: false,
    doubleDeck: false,
    towHitch: false,
    services: [],
    serviceAreas: [],
    regionSlug: null,
    citySlug: null,
    districtSlug: 'arabkir',
    locationName: 'Արաբկիր',
    featuredAt: null,
    featuredUntil: null,
    isPartner: false,
    images: [],
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  })

  function build(presence: () => Promise<AppPresenceRow[]>) {
    const repository = {
      findCardsByIds: vi.fn(async (ids: number[]) => ids.map(card)),
      findAppPresence: vi.fn(presence),
    } as unknown as TowTrucksRepository
    const reviews = { groupApprovedByTowTruckIds: vi.fn(async () => []) } as unknown as ReviewsRepository
    return { service: new TowTrucksService(repository, reviews), repository }
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('adds the status only to drivers with the app', async () => {
    vi.stubEnv('LIVE_DISPATCH_ENABLED', 'true')
    const { service } = build(async () => [
      { ...online, towTruckId: 1 },
      { ...online, towTruckId: 2, onOrder: true },
      { ...online, towTruckId: 3, wantsOnline: false },
    ])
    const cards = await service.getCardsByIds([1, 2, 3, 4])
    expect(cards.map((c) => c.appStatus)).toEqual(['FREE', 'BUSY', undefined, undefined])
    expect(cards.filter((c) => 'appStatus' in c)).toHaveLength(2)
  })

  it('asks nothing while live dispatch is off', async () => {
    vi.stubEnv('LIVE_DISPATCH_ENABLED', 'false')
    const { service, repository } = build(async () => [{ ...online }])
    const cards = await service.getCardsByIds([1])
    expect(cards[0]?.appStatus).toBeUndefined()
    expect(repository.findAppPresence).not.toHaveBeenCalled()
  })

  it('never fails the listing when the query does', async () => {
    vi.stubEnv('LIVE_DISPATCH_ENABLED', 'true')
    const { service } = build(async () => {
      throw new Error('relation "FleetDriver" does not exist')
    })
    const cards = await service.getCardsByIds([1, 2])
    expect(cards).toHaveLength(2)
    expect(cards.every((c) => c.appStatus === undefined)).toBe(true)
  })
})
