import { describe, expect, it } from 'vitest'
import {
  listingRank,
  orderListing,
  pickListingOrder,
  seededShuffle,
  type ListingPlace,
} from '../src/tow-trucks/listing-order'
import type { TowTruckCardApi } from '../src/tow-trucks/tow-truck.types'

/**
 * The order a town's listing is read in.
 *
 * It used to be decided in the browser's render; it is decided here now, so
 * the API's answer IS the listing. These tests are the properties that make
 * that safe: the ranks are honoured on every seed, the shuffle is uniform
 * enough to be fair, and a visitor is never handed the order they just saw.
 */
const ABOVYAN: ListingPlace = { citySlug: 'abovyan' }

function truck(id: number, overrides: Partial<TowTruckCardApi> = {}): TowTruckCardApi {
  return {
    id,
    slug: `truck-${id}`,
    driverName: `Վարորդ ${id}`,
    phone: '+37491000001',
    works24Hours: false,
    vehicle: {
      brand: 'Isuzu',
      model: 'Elf',
      type: 'flatbed',
      capacityTons: 3,
      manipulator: false,
      wheelSkates: false,
      doubleDeck: false,
      towHitch: false,
    },
    services: [],
    serviceAreas: [],
    location: { citySlug: 'abovyan', name: 'Աբովյան' },
    isPartner: false,
    images: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as TowTruckCardApi
}

/** Based elsewhere — reaches this listing through `serviceAreas`, not through its base */
function visitor(id: number, overrides: Partial<TowTruckCardApi> = {}): TowTruckCardApi {
  return truck(id, { location: { citySlug: 'hrazdan', name: 'Հրազդան' }, ...overrides })
}

describe('listingRank', () => {
  it('puts a paid placement first, but only on the driver’s own town', () => {
    // The `&& based here` is the product decision: what is sold is the top of
    // the driver's OWN town. A placement that travelled could be bought once
    // and cashed in on forty pages.
    const promoted = truck(1, { promotedAt: '2026-02-01T00:00:00.000Z' })
    const elsewhere = visitor(2, { promotedAt: '2026-02-01T00:00:00.000Z' })

    expect(listingRank(promoted, ABOVYAN)).toBe(0)
    expect(listingRank(elsewhere, ABOVYAN)).toBe(4)
  })

  it('sorts “ours” INSIDE “based here”, never ahead of it', () => {
    // Someone searching a town is choosing among that town's drivers, and a
    // driver an hour away is an hour away whoever they are. So a partner who
    // merely covers the town stays in rank 4 with everyone else who covers it.
    expect(listingRank(truck(1, { isPartner: true }), ABOVYAN)).toBe(1)
    expect(listingRank(truck(2), ABOVYAN)).toBe(2)
    expect(listingRank(visitor(3, { isPartner: true }), ABOVYAN)).toBe(4)
  })
})

describe('the «Ամբողջ սպասարկման տարածքում» placement', () => {
  const COVERS_ABOVYAN = [{ name: 'Աբովյան', slug: 'abovyan', type: 'city' as const }]
  const area = (id: number, at: string, overrides: Partial<TowTruckCardApi> = {}) =>
    visitor(id, {
      promotedAt: at,
      promotedInArea: true,
      serviceAreas: COVERS_ABOVYAN,
      ...overrides,
    })

  it('comes right after the local drivers on a page the driver covers', () => {
    expect(listingRank(area(1, '2026-02-01T00:00:00.000Z'), ABOVYAN)).toBe(3)
  })

  it('is still the top of the driver’s own town — it includes the home product', () => {
    const atHome = truck(1, {
      promotedAt: '2026-02-01T00:00:00.000Z',
      promotedInArea: true,
      serviceAreas: COVERS_ABOVYAN,
    })
    expect(listingRank(atHome, ABOVYAN)).toBe(0)
  })

  it('never climbs above a driver based here, paid or not', () => {
    const ordered = orderListing(
      [area(1, '2026-03-01T00:00:00.000Z'), truck(2), truck(3, { isPartner: true })],
      ABOVYAN,
      42,
    )
    expect(ordered.map((row) => row.id)).toEqual([3, 2, 1])
  })

  it('needs the place in the driver’s OWN coverage list, not just on the page', () => {
    // A corridor or a nationwide specialist can reach a page without naming
    // it — one purchase must not become the second slot of every town.
    const viaCorridor = area(1, '2026-02-01T00:00:00.000Z', {
      serviceAreas: [{ name: 'Գառնի–Գեղարդ', slug: 'garni-geghard', type: 'route' }],
    })
    expect(listingRank(viaCorridor, ABOVYAN)).toBe(4)
  })

  it('matches a Yerevan district by its district slug', () => {
    const avan = { districtSlug: 'avan' }
    const driver = visitor(1, {
      location: { districtSlug: 'kentron', name: 'Կենտրոն' },
      promotedAt: '2026-02-01T00:00:00.000Z',
      promotedInArea: true,
      serviceAreas: [{ name: 'Ավան', slug: 'avan', type: 'district' }],
    })
    expect(listingRank(driver, avan)).toBe(3)
  })

  it('is a queue by last refresh, and not shuffled', () => {
    const older = area(1, '2026-02-01T00:00:00.000Z')
    const newer = area(2, '2026-02-02T00:00:00.000Z')
    for (let seed = 0; seed < 50; seed += 1) {
      const ids = orderListing([older, visitor(3), newer], ABOVYAN, seed).map((row) => row.id)
      expect(ids).toEqual([2, 1, 3])
    }
  })

  it('is excluded from the “avoid the last order” check, like the home queue', () => {
    // Two queued drivers cannot be moved by a reseed; demanding it would burn
    // every attempt and hand back an arbitrary order.
    const first = area(1, '2026-02-02T00:00:00.000Z')
    const second = area(2, '2026-02-01T00:00:00.000Z')
    const ordered = pickListingOrder([first, second, visitor(3), visitor(4)], ABOVYAN, 7, [1, 2, 3, 4])
    expect(ordered.slice(0, 2).map((row) => row.id)).toEqual([1, 2])
    expect(ordered.slice(2).map((row) => row.id)).toEqual([4, 3])
  })
})

describe('orderListing', () => {
  const trucks = [
    visitor(1),
    truck(2),
    truck(3, { isPartner: true }),
    truck(4, { promotedAt: '2026-01-01T00:00:00.000Z' }),
    truck(5, { promotedAt: '2026-03-01T00:00:00.000Z' }),
    visitor(6),
    truck(7),
  ]

  it('honours the ranks on every seed', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const ranks = orderListing(trucks, ABOVYAN, seed).map((row) => listingRank(row, ABOVYAN))
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
    }
  })

  it('keeps the paid queue newest-first and out of the shuffle', () => {
    // Somebody bought that position. "Sometimes the top" is not what they
    // bought, so this block is a queue by purchase date, not a shuffle.
    for (let seed = 0; seed < 50; seed += 1) {
      expect(orderListing(trucks, ABOVYAN, seed).slice(0, 2).map((row) => row.id)).toEqual([5, 4])
    }
  })

  it('shuffles inside a rank rather than fixing a queue in it', () => {
    const firstOfRankTwo = new Set(
      Array.from({ length: 60 }, (_, seed) =>
        orderListing(trucks, ABOVYAN, seed).find((row) => listingRank(row, ABOVYAN) === 2)?.id,
      ),
    )

    expect(firstOfRankTwo.size).toBeGreaterThan(1)
  })

  it('is a flat shuffle on a road corridor, where nobody is based', () => {
    // No driver can be based in «Գառնի–Գեղարդ», so no driver there is more
    // local than any other — one group, one shuffle.
    const orders = new Set(
      Array.from({ length: 40 }, (_, seed) =>
        orderListing(trucks, {}, seed)
          .map((row) => row.id)
          .join(','),
      ),
    )

    expect(orders.size).toBeGreaterThan(1)
  })

  it('does not mutate the list it was given', () => {
    const input = [...trucks]
    orderListing(input, ABOVYAN, 7)
    expect(input.map((row) => row.id)).toEqual(trucks.map((row) => row.id))
  })

  it('keeps every driver exactly once', () => {
    const ids = orderListing(trucks, ABOVYAN, 11)
      .map((row) => row.id)
      .sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('pickListingOrder', () => {
  const town = [truck(1), truck(2), truck(3), truck(4), truck(5)]

  it('hands a first visit the seed it was given, shuffled', () => {
    // Nothing to avoid is not a repeat. It is still a shuffle — the seed is a
    // fresh random number per request, which is what makes two visitors
    // arriving at the same town at the same moment see different drivers.
    expect(pickListingOrder(town, ABOVYAN, 42).map((row) => row.id)).toEqual(
      orderListing(town, ABOVYAN, 42).map((row) => row.id),
    )
  })

  it('gives different first visitors different orders', () => {
    const firsts = new Set(
      Array.from({ length: 50 }, (_, seed) => pickListingOrder(town, ABOVYAN, seed)[0]?.id),
    )
    expect(firsts.size).toBeGreaterThan(1)
  })

  it('never leaves a driver who could move where the visitor last saw them', () => {
    // The complaint this answers is a driver seeing themselves in the same slot
    // twice running — which a whole-list comparison would call "different" as
    // long as somebody else moved.
    for (let seed = 0; seed < 100; seed += 1) {
      const previous = pickListingOrder(town, ABOVYAN, seed).map((row) => row.id)
      const next = pickListingOrder(town, ABOVYAN, seed + 1000, previous).map((row) => row.id)

      for (let i = 0; i < previous.length; i += 1) {
        expect(next[i], `slot ${i} repeated for seed ${seed}`).not.toBe(previous[i])
      }
    }
  })

  it('compares over the overlap, so a capped record still constrains the order', () => {
    // The record is capped and the live list changes, so the two are rarely the
    // same length. Demanding they match meant every busy town bailed out and
    // the guarantee silently did nothing on exactly the pages that needed it.
    const previous = pickListingOrder(town, ABOVYAN, 5)
      .map((row) => row.id)
      .slice(0, 2)
    const next = pickListingOrder(town, ABOVYAN, 5, previous).map((row) => row.id)

    expect(next.slice(0, 2)).not.toEqual(previous)
  })

  it('does not fight a position nobody could have moved out of', () => {
    // One local driver, everyone else merely covering: slot 0 is that driver's
    // whatever the shuffle does. Demanding they leave it would spend all 60
    // attempts and return the last one tried rather than a chosen one — which
    // is how "always different" quietly becomes "arbitrary, and often the same".
    const oneLocal = [truck(1), visitor(2), visitor(3), visitor(4)]
    const previous = pickListingOrder(oneLocal, ABOVYAN, 3).map((row) => row.id)
    const next = pickListingOrder(oneLocal, ABOVYAN, 3, previous).map((row) => row.id)

    // The one local driver keeps slot 0 — there is no other rank-2 driver to
    // swap with, and the ranks, not the shuffle, put them there.
    expect(next[0]).toBe(1)
    // Everyone who COULD move did. Had slot 0 counted as a repeat, the loop
    // would have burned all 60 attempts and returned the last one tried.
    expect(next.slice(1)).not.toEqual(previous.slice(1))
  })
})

describe('seededShuffle', () => {
  it('reaches first place from every position, roughly evenly', () => {
    // A generator that quietly favours some positions would mean a driver who
    // is always near the top — the exact thing the shuffle exists to prevent.
    const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const firsts = new Map<number, number>()

    for (let seed = 0; seed < 10_000; seed += 1) {
      const first = seededShuffle(items, seed)[0] as number
      firsts.set(first, (firsts.get(first) ?? 0) + 1)
    }

    expect(firsts.size).toBe(items.length)
    for (const count of firsts.values()) {
      expect(count).toBeGreaterThan(700)
      expect(count).toBeLessThan(1300)
    }
  })
})
