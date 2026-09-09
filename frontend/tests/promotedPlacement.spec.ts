import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SortOption } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import { isPromotedAt, sortTowTrucks } from '~/utils/towTruckFilters'
import { FEATURED_MAX_DAYS, FEATURED_MIN_DAYS } from '~/constants/featured'

/**
 * The paid top placement, as it is actually sold: the first position on the
 * driver's OWN town's page, for a number of days.
 *
 * These are the rules money changes hands over, so they are tested as
 * behaviour, on the real comparator, with a fixed seed — not as source text.
 */

function card(over: Partial<TowTruckCard> & { id: number }): TowTruckCard {
  return {
    slug: `d${over.id}`,
    driverName: `Driver ${over.id}`,
    phone: '+37400000000',
    works24Hours: false,
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
/** Any seed — the point is that the promoted order survives whatever it does */
const SEED = 12345

function order(trucks: TowTruckCard[]): number[] {
  return sortTowTrucks(trucks, SortOption.Recommended, SEED, false, ABOVYAN).map((t) => t.id)
}

describe('isPromotedAt', () => {
  it('is true only for a live placement on the driver’s own town', () => {
    const promoted = card({ id: 1, promotedAt: '2026-09-09T00:00:00.000Z' })
    expect(isPromotedAt(promoted, ABOVYAN)).toBe(true)
  })

  it('is false for a promoted driver based somewhere else', () => {
    // The product decision, not a guard: what is sold is the top of the
    // driver's own town. A visitor cannot buy their way above the locals.
    const visiting = card({
      id: 2,
      promotedAt: '2026-09-09T00:00:00.000Z',
      location: { name: 'Հրազդան', citySlug: 'hrazdan' },
    })
    expect(isPromotedAt(visiting, ABOVYAN)).toBe(false)
  })

  it('is false when the placement is not live', () => {
    // `promotedAt` is absent exactly when it has expired — the backend decided
    // once, for the whole response, so nothing here compares against a clock.
    expect(isPromotedAt(card({ id: 3 }), ABOVYAN)).toBe(false)
  })

  it('is false on a page that is about no particular place', () => {
    // A corridor page passes no base place: nobody is "based" on a road, so
    // nobody is promoted there either.
    expect(isPromotedAt(card({ id: 4, promotedAt: '2026-09-09T00:00:00.000Z' }), undefined)).toBe(
      false,
    )
  })
})

describe('listing order on a town page', () => {
  it('puts a promoted local above the other locals', () => {
    const trucks = [
      card({ id: 1 }),
      card({ id: 2, promotedAt: '2026-09-01T00:00:00.000Z' }),
      card({ id: 3 }),
    ]
    expect(order(trucks)[0]).toBe(2)
  })

  it('orders several placements newest purchase first', () => {
    // The queue. A driver who pays today is first tomorrow; the one who paid
    // last week moves down by one rather than being displaced.
    const trucks = [
      card({ id: 1, promotedAt: '2026-09-01T00:00:00.000Z' }),
      card({ id: 2, promotedAt: '2026-09-08T00:00:00.000Z' }),
      card({ id: 3, promotedAt: '2026-09-05T00:00:00.000Z' }),
    ]
    expect(order(trucks)).toEqual([2, 3, 1])
  })

  it('gives the promoted group a fixed order, whatever the shuffle seed', () => {
    // Every other group is shuffled per page load. This one must not be: a
    // shuffle here sells each of them "sometimes the top", which is not what
    // the top spot means to somebody who just paid for it.
    const trucks = [
      card({ id: 1, promotedAt: '2026-09-01T00:00:00.000Z' }),
      card({ id: 2, promotedAt: '2026-09-08T00:00:00.000Z' }),
    ]
    for (const seed of [1, 7, 99, 123456, 0xffffffff]) {
      const ids = sortTowTrucks(trucks, SortOption.Recommended, seed, false, ABOVYAN).map(
        (t) => t.id,
      )
      expect(ids).toEqual([2, 1])
    }
  })

  it('never lifts a promoted visitor above a plain local', () => {
    // The promise the listing makes to a customer — a local driver first — is
    // the one thing that is not for sale.
    const trucks = [
      card({ id: 1 }),
      card({
        id: 2,
        promotedAt: '2026-09-08T00:00:00.000Z',
        location: { name: 'Հրազդան', citySlug: 'hrazdan' },
      }),
    ]
    expect(order(trucks)).toEqual([1, 2])
  })

  it('keeps locals above non-locals, promoted or not', () => {
    const trucks = [
      card({ id: 1, location: { name: 'Հրազդան', citySlug: 'hrazdan' } }),
      card({ id: 2 }),
      card({ id: 3, promotedAt: '2026-09-08T00:00:00.000Z' }),
    ]
    expect(order(trucks)).toEqual([3, 2, 1])
  })

  it('sorts a legacy open-ended grant after the dated ones, not first', () => {
    // Those rows have `isFeatured` with no `featuredAt`, so the backend sends
    // no `promotedAt` for them at all — they are simply not promoted here.
    const trucks = [
      card({ id: 1 }),
      card({ id: 2, promotedAt: '2026-09-08T00:00:00.000Z' }),
    ]
    expect(order(trucks)[0]).toBe(2)
  })

  it('leaves the price sort alone', () => {
    // The customer asked for cheapest first. A paid placement does not
    // outrank an instruction the customer typed themselves.
    const trucks = [
      card({ id: 1, startingPrice: 5000 }),
      card({ id: 2, promotedAt: '2026-09-08T00:00:00.000Z', startingPrice: 9000 }),
    ]
    const ids = sortTowTrucks(trucks, SortOption.Price, SEED, false, ABOVYAN).map((t) => t.id)
    expect(ids).toEqual([1, 2])
  })
})

describe('the day bounds are the backend’s', () => {
  it('matches `featured.ts` on the server', () => {
    // MANUAL SYNC POINT — the backend refuses anything outside its own range,
    // so a wider one here would only turn a hint into a 400.
    const backend = readFileSync(
      fileURLToPath(new URL('../../backend/src/tow-trucks/featured.ts', import.meta.url)),
      'utf8',
    )
    expect(backend).toContain(`export const FEATURED_MIN_DAYS = ${FEATURED_MIN_DAYS}`)
    expect(backend).toContain(`export const FEATURED_MAX_DAYS = ${FEATURED_MAX_DAYS}`)
  })
})

describe('the price sort stays a valid comparator', () => {
  it('never returns NaN when two drivers both left the price blank', () => {
    // `Infinity - Infinity` is NaN, and a comparator that returns NaN makes the
    // whole sort implementation-defined. This list is server-rendered and then
    // hydrated, so that means the server and the browser can legitimately
    // disagree about the order of the same page.
    const trucks = [
      card({ id: 1 }),
      card({ id: 2, startingPrice: 5000 }),
      card({ id: 3 }),
      card({ id: 4, startingPrice: 1000 }),
    ]
    const ids = sortTowTrucks(trucks, SortOption.Price, SEED, false, ABOVYAN).map((t) => t.id)
    expect(ids.slice(0, 2)).toEqual([4, 2])
    expect(ids.slice(2).sort()).toEqual([1, 3])
  })

  it('is deterministic across repeated sorts of the same input', () => {
    const trucks = [card({ id: 1 }), card({ id: 2 }), card({ id: 3 }), card({ id: 4 })]
    const first = sortTowTrucks(trucks, SortOption.Price, SEED, false, ABOVYAN).map((t) => t.id)
    const second = sortTowTrucks(trucks, SortOption.Price, SEED, false, ABOVYAN).map((t) => t.id)
    expect(second).toEqual(first)
  })
})
