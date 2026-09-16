import { describe, expect, it } from 'vitest'
import { SortOption } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import { sortTowTrucks } from '~/utils/towTruckFilters'

/**
 * "Our drivers" in the public Recommended order.
 *
 * On a city or district page the base location is the outer split and being
 * ours sorts inside it:
 *
 *   paid placement → ours, based here → based here → everyone else covering
 *
 * So the relationship decides which of the LOCAL drivers is seen first, and
 * never whether a driver an hour away outranks them. A partner who merely
 * covers the place is in the last group with everyone else who merely covers
 * it — once a driver is not based here, being ours is not what the customer
 * standing next to the broken car is choosing on.
 *
 * Tested as behaviour on the real comparator with a fixed seed, like
 * promotedPlacement.spec.ts — these are the rules that decide who gets seen.
 */
function card(over: Partial<TowTruckCard> & { id: number }): TowTruckCard {
  return {
    slug: `d${over.id}`,
    driverName: `Driver ${over.id}`,
    phone: '+37400000000',
    works24Hours: false,
    isPartner: false,
    vehicle: {
      brand: 'X',
      model: 'Y',
      type: 'evacuator',
      capacityTons: 3,
      manipulator: false,
      wheelSkates: false,
      doubleDeck: false,
      towHitch: false,
    },
    services: [],
    serviceAreas: [],
    location: { name: 'Աբովյան', citySlug: 'abovyan' },
    images: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as TowTruckCard
}

const ABOVYAN = { citySlug: 'abovyan' }
const ELSEWHERE = { name: 'Գյումրի', citySlug: 'gyumri' }
const SEED = 12345

/** The city/district page's own order — `tiered: false` */
const flatOrder = (trucks: TowTruckCard[]): number[] =>
  sortTowTrucks(trucks, SortOption.Recommended, SEED, false, ABOVYAN).map((t) => t.id)

/** Every other listing — marz, vehicle type, homepage, "similar" */
const tieredOrder = (trucks: TowTruckCard[]): number[] =>
  sortTowTrucks(trucks, SortOption.Recommended, SEED).map((t) => t.id)

describe('our drivers on a city page', () => {
  it('come before equally-local strangers', () => {
    const ours = card({ id: 1, isPartner: true })
    const stranger = card({ id: 2 })

    expect(flatOrder([stranger, ours])[0]).toBe(1)
  })

  it('only when they are based here — the base location is the outer split', () => {
    const oursHere = card({ id: 1, isPartner: true })
    const oursElsewhere = card({ id: 2, isPartner: true, location: ELSEWHERE })
    const strangerHere = card({ id: 3 })

    // Ours-here first, then the local stranger, and only then ours-from-away.
    expect(flatOrder([oursElsewhere, strangerHere, oursHere])).toEqual([1, 3, 2])
  })

  it('still come after a paid placement — that position was sold', () => {
    const paid = card({ id: 1, promotedAt: '2026-09-09T00:00:00.000Z' })
    const ours = card({ id: 2, isPartner: true })

    expect(flatOrder([ours, paid])).toEqual([1, 2])
  })

  it('do NOT outrank a local driver when based elsewhere', () => {
    // A partner an hour away is an hour away. The relationship decides which
    // of the local drivers is seen first, not whether a non-local one is.
    const localStranger = card({ id: 1 })
    const farPartner = card({ id: 2, isPartner: true, location: ELSEWHERE })

    expect(flatOrder([farPartner, localStranger])).toEqual([1, 2])
  })

  it('leaves based-here above merely-covering, as it always was', () => {
    const local = card({ id: 1 })
    const covering = card({ id: 2, location: ELSEWHERE })

    expect(flatOrder([covering, local])).toEqual([1, 2])
  })
})

describe('our drivers on every other listing', () => {
  it('come first, ahead of a better-rated stranger', () => {
    // No locality to protect here: a marz or vehicle-type page is not about
    // one town, so nobody nearer is being displaced.
    const ours = card({ id: 1, isPartner: true, rating: { average: 3, count: 10 } })
    const betterRated = card({ id: 2, rating: { average: 5, count: 50 } })

    expect(tieredOrder([betterRated, ours])[0]).toBe(1)
  })

  it('leave the rating band deciding among themselves', () => {
    const better = card({ id: 1, isPartner: true, rating: { average: 5, count: 50 } })
    const worse = card({ id: 2, isPartner: true, rating: { average: 2, count: 10 } })

    expect(tieredOrder([worse, better])[0]).toBe(1)
  })
})
