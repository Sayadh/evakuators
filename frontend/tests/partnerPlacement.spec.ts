import { describe, expect, it } from 'vitest'
import { SortOption } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import { sortTowTrucks } from '~/utils/towTruckFilters'

/**
 * "Our drivers" in the public Recommended order.
 *
 * Two rules decide this, and their order is the product decision:
 *
 * 1. a placement was BOUGHT, so it stays above a relationship that was not;
 * 2. being ours outranks locality — a partner who merely covers the town is
 *    shown above a stranger based in it. The operator's explicit call: they
 *    answer for these drivers, so a customer who rings one is the platform's
 *    own promise being kept.
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

  it('still come after a paid placement — that position was sold', () => {
    const paid = card({ id: 1, promotedAt: '2026-09-09T00:00:00.000Z' })
    const ours = card({ id: 2, isPartner: true })

    expect(flatOrder([ours, paid])).toEqual([1, 2])
  })

  it('come before a local stranger even when based elsewhere', () => {
    // The cost of rule 2, pinned so nobody has to wonder whether it was
    // intended: a partner covering Abovyan outranks a driver based in it.
    const localStranger = card({ id: 1 })
    const farPartner = card({ id: 2, isPartner: true, location: ELSEWHERE })

    expect(flatOrder([localStranger, farPartner])).toEqual([2, 1])
  })

  it('leaves based-here above merely-covering among everyone else', () => {
    // Unchanged original rule, still in force below the partner tier.
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
