import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { DispatchService } from '../src/dispatch/dispatch.service'
import type { DispatchRepository, DispatchCandidateRow } from '../src/dispatch/dispatch.repository'
import type { ReviewsRepository } from '../src/reviews/reviews.repository'
import type { SubscriptionsRepository } from '../src/subscriptions/subscriptions.repository'
import type { RouteMatrixService } from '../src/routing/route-matrix.service'
import type { RouteQuotaService } from '../src/routing/route-quota.service'

/**
 * «Ըստ կոորդինատների» ranks by ROAD distance.
 *
 * Straight-line distance is a good filter and a bad ranking: a driver 3 km away
 * across a gorge is further by road than one 6 km away on the highway, and in
 * Armenia that is not a corner case. These tests pin the two halves — that the
 * road order is the one shown, and that an unreachable routing service degrades
 * the screen rather than breaking it.
 */
const ORIGIN = { latitude: 40.1792, longitude: 44.4991 }

/** Three drivers, deliberately in a different straight-line order than road order */
const CANDIDATES = [
  { id: 1, straightLineMeters: 1_000, latitude: 40.18, longitude: 44.5 },
  { id: 2, straightLineMeters: 2_000, latitude: 40.19, longitude: 44.51 },
  { id: 3, straightLineMeters: 3_000, latitude: 40.2, longitude: 44.52 },
]

function truck(id: number): DispatchCandidateRow {
  return {
    id,
    slug: `truck-${id}`,
    driverName: `Վարորդ ${id}`,
    companyName: null,
    phone: '+37491000001',
    vehicleBrand: 'Isuzu',
    vehicleModel: 'Elf',
    vehicleType: 'flatbed',
    capacityTons: 3,
    wheelSkates: false,
    locationName: 'Աբովյան',
    regionSlug: 'kotayk',
    citySlug: 'abovyan',
    districtSlug: null,
    servesAllArmenia: false,
    serviceAreas: [],
    isFeatured: false,
    featuredUntil: null,
    isPartner: false,
    isActive: true,
  } as unknown as DispatchCandidateRow
}

function build(options: {
  hasRemaining?: boolean
  matrix?: ({ meters: number; seconds: number } | null)[] | null
}) {
  const consume = vi.fn()
  const matrixCall = vi.fn(async () => options.matrix ?? null)

  const dispatchRepository = {
    findCandidatesByDistance: vi.fn(async () => CANDIDATES),
    findCandidatesByIds: vi.fn(async () => CANDIDATES.map((row) => truck(row.id))),
    statsFor: vi.fn(async () => new Map()),
    countsSince: vi.fn(async () => new Map()),
    phoneClicksSince: vi.fn(async () => new Map()),
  } as unknown as DispatchRepository

  const service = new DispatchService(
    dispatchRepository,
    { groupApprovedByTowTruckIds: vi.fn(async () => []) } as unknown as ReviewsRepository,
    { findCoverage: vi.fn(async () => new Map()) } as unknown as SubscriptionsRepository,
    { matrix: matrixCall } as unknown as RouteMatrixService,
    {
      hasRemaining: vi.fn(() => options.hasRemaining ?? true),
      consume,
    } as unknown as RouteQuotaService,
  )

  return { service, consume, matrixCall }
}

const road = (meters: number) => ({ meters, seconds: meters / 10 })

describe('dispatch coordinate search', () => {
  it('shows the road order, not the straight-line one', async () => {
    // The whole point. Driver 3 is furthest as the crow flies and nearest by
    // road; a dispatcher reading this list is about to tell somebody how long
    // to wait.
    const { service } = build({ matrix: [road(9_000), road(7_000), road(1_500)] })

    const answer = await service.listCandidatesByCoordinates(ORIGIN.latitude, ORIGIN.longitude)

    expect(answer.routed).toBe(true)
    expect(answer.items.map((item) => item.id)).toEqual([3, 2, 1])
    expect(answer.items.map((item) => item.distanceMeters)).toEqual([1_500, 7_000, 9_000])
  })

  it('routes the candidates PostGIS chose, from the point that was searched', async () => {
    const { service, matrixCall } = build({ matrix: [road(1), road(2), road(3)] })

    await service.listCandidatesByCoordinates(ORIGIN.latitude, ORIGIN.longitude)

    expect(matrixCall).toHaveBeenCalledWith(
      ORIGIN,
      CANDIDATES.map((row) => ({ latitude: row.latitude, longitude: row.longitude })),
    )
  })

  it('spends the budget before the call, not after it', async () => {
    // A request that times out or returns a 5xx has still used a slot against
    // ORS's own counter. Counting it only on success would let this keep
    // trying past the point ORS has already cut it off.
    const { service, consume } = build({ matrix: null })

    await service.listCandidatesByCoordinates(ORIGIN.latitude, ORIGIN.longitude)

    expect(consume).toHaveBeenCalledTimes(1)
  })

  it('falls back to straight line when the shared budget is gone, and says so', async () => {
    // One key, one daily allowance, shared with `/evakuator`. A dispatcher who
    // cannot route still has to be able to find somebody.
    const { service, matrixCall } = build({ hasRemaining: false })

    const answer = await service.listCandidatesByCoordinates(ORIGIN.latitude, ORIGIN.longitude)

    expect(matrixCall).not.toHaveBeenCalled()
    expect(answer.routed).toBe(false)
    expect(answer.items.map((item) => item.id)).toEqual([1, 2, 3])
  })

  it('falls back the same way when the provider fails', async () => {
    const { service } = build({ matrix: null })

    const answer = await service.listCandidatesByCoordinates(ORIGIN.latitude, ORIGIN.longitude)

    expect(answer.routed).toBe(false)
    expect(answer.items.map((item) => item.distanceMeters)).toEqual([1_000, 2_000, 3_000])
  })

  it('keeps a driver ORS could not reach, on their straight-line number', async () => {
    // Per driver, not per response: a null entry is one destination with no
    // road to it, and that driver is still somebody the dispatcher can ring.
    const { service } = build({ matrix: [road(9_000), null, road(1_500)] })

    const answer = await service.listCandidatesByCoordinates(ORIGIN.latitude, ORIGIN.longitude)

    expect(answer.routed).toBe(true)
    expect(answer.items.map((item) => item.id)).toEqual([3, 2, 1])
    // 2 keeps its 2000 m straight line and lands between the two routed ones.
    expect(answer.items.map((item) => item.distanceMeters)).toEqual([1_500, 2_000, 9_000])
  })

  it('says nothing was routed when there was nobody to route', async () => {
    const { service, matrixCall } = build({ matrix: [] })
    ;(
      service as unknown as { dispatchRepository: { findCandidatesByDistance: () => Promise<[]> } }
    ).dispatchRepository.findCandidatesByDistance = async () => []

    const answer = await service.listCandidatesByCoordinates(ORIGIN.latitude, ORIGIN.longitude)

    expect(answer.items).toEqual([])
    expect(answer.routed).toBe(false)
    expect(matrixCall).not.toHaveBeenCalled()
  })
})
