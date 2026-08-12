import { describe, expect, it } from 'vitest'
import { RATING_PRIOR } from '~/constants/rating'
import { SortOption } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import { composeLocationName, placementFor } from '~/utils/primaryArea'
import { isBasedAt, sortTowTrucks } from '~/utils/towTruckFilters'

/**
 * "Drivers based here first" — the ordering rule on a city or district page.
 *
 * The thing worth pinning is not that the boost exists but where it stops: it
 * must beat rating, must NOT touch the price sort, and must be a no-op for
 * every page that has no single base (corridors, the homepage, search).
 */

let nextId = 1

function truck(
  overrides: {
    citySlug?: string
    districtSlug?: string
    rating?: { average: number; count: number }
    startingPrice?: number
  } = {},
): TowTruckCard {
  const { citySlug, districtSlug, rating, startingPrice } = overrides
  return {
    id: nextId++,
    slug: `truck-${nextId}`,
    driverName: 'Վարորդ',
    phone: '+37491000001',
    works24Hours: false,
    vehicle: { brand: 'Isuzu', model: 'NPR', type: 'flatbed', capacityTons: 3, manipulator: false },
    services: [],
    serviceAreas: [],
    location: { citySlug, districtSlug, name: 'Հիմք' },
    ...(rating ? { rating } : {}),
    ...(startingPrice !== undefined ? { startingPrice } : {}),
    images: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as TowTruckCard
}

/** Well above the 4.3 prior, so it wins every rating comparison in this file */
const GREAT = { average: 5, count: 40 }
/** Well below it */
const POOR = { average: 2, count: 40 }

describe('isBasedAt', () => {
  it('matches on the structural placement, not on coverage', () => {
    // Every driver on a city page already SERVES that city — matching on
    // serviceAreas would be true for all of them and would rank nothing.
    const based = truck({ citySlug: 'vardenis' })
    based.serviceAreas = [{ slug: 'gavar', name: 'Գավառ', type: 'city' }] as never

    expect(isBasedAt(based, { citySlug: 'vardenis' })).toBe(true)
    expect(isBasedAt(based, { citySlug: 'gavar' })).toBe(false)
  })

  it('keeps cities and districts in separate namespaces', () => {
    expect(isBasedAt(truck({ districtSlug: 'kentron' }), { citySlug: 'kentron' })).toBe(false)
    expect(isBasedAt(truck({ districtSlug: 'kentron' }), { districtSlug: 'kentron' })).toBe(true)
  })

  it('is false for every truck when the page has no base place', () => {
    // A corridor page passes nothing: nobody is "based in" «Գառնի–Գեղարդ».
    expect(isBasedAt(truck({ citySlug: 'vardenis' }), undefined)).toBe(false)
    expect(isBasedAt(truck(), { citySlug: 'vardenis' })).toBe(false)
  })
})

describe('Recommended order', () => {
  it('puts a locally-based driver above a better-rated outsider', () => {
    const local = truck({ citySlug: 'vardenis', rating: POOR })
    const outsider = truck({ citySlug: 'gavar', rating: GREAT })

    const sorted = sortTowTrucks([outsider, local], SortOption.Recommended, {
      citySlug: 'vardenis',
    })

    expect(sorted[0]).toBe(local)
  })

  it('still ranks by rating inside each tier', () => {
    // Being local wins a tie against a stranger; it does not rescue a bad
    // driver from the bottom of their own tier.
    const localGood = truck({ citySlug: 'vardenis', rating: GREAT })
    const localBad = truck({ citySlug: 'vardenis', rating: POOR })
    const outsiderGood = truck({ citySlug: 'gavar', rating: GREAT })
    const outsiderBad = truck({ citySlug: 'gavar', rating: POOR })

    const sorted = sortTowTrucks(
      [outsiderBad, localBad, outsiderGood, localGood],
      SortOption.Recommended,
      { citySlug: 'vardenis' },
    )

    expect(sorted).toEqual([localGood, localBad, outsiderGood, outsiderBad])
  })

  it('changes nothing when no base place is given', () => {
    // The homepage and search pass none, and their order must be exactly what
    // it was before this rule existed.
    const good = truck({ citySlug: 'gavar', rating: GREAT })
    const bad = truck({ citySlug: 'vardenis', rating: POOR })

    expect(sortTowTrucks([bad, good], SortOption.Recommended)).toEqual([good, bad])
  })

  it('treats a truck with no placement as an outsider, not as an error', () => {
    const placeless = truck({ rating: GREAT })
    const local = truck({ citySlug: 'vardenis', rating: POOR })

    const sorted = sortTowTrucks([placeless, local], SortOption.Recommended, {
      citySlug: 'vardenis',
    })

    expect(sorted).toEqual([local, placeless])
  })

  it('ranks an unrated local above an unrated outsider', () => {
    // Both score exactly RATING_PRIOR, so the tie-break is the only thing
    // deciding — asserted so a future change to the prior cannot silently make
    // this test pass for the wrong reason.
    const local = truck({ citySlug: 'vardenis' })
    const outsider = truck({ citySlug: 'gavar' })
    expect(RATING_PRIOR).toBeGreaterThan(0)

    expect(
      sortTowTrucks([outsider, local], SortOption.Recommended, { citySlug: 'vardenis' })[0],
    ).toBe(local)
  })

  it('works the same way on a Yerevan district page', () => {
    const local = truck({ districtSlug: 'kentron', rating: POOR })
    const outsider = truck({ districtSlug: 'arabkir', rating: GREAT })

    expect(
      sortTowTrucks([outsider, local], SortOption.Recommended, { districtSlug: 'kentron' })[0],
    ).toBe(local)
  })
})

describe('Price order is left alone', () => {
  it('does not float a local driver above a cheaper outsider', () => {
    // The customer overrode the default with an explicit instruction. A
    // locally-based driver appearing above a cheaper one would read as the
    // sort being broken.
    const localExpensive = truck({ citySlug: 'vardenis', startingPrice: 20000 })
    const outsiderCheap = truck({ citySlug: 'gavar', startingPrice: 5000 })

    const sorted = sortTowTrucks([localExpensive, outsiderCheap], SortOption.Price, {
      citySlug: 'vardenis',
    })

    expect(sorted).toEqual([outsiderCheap, localExpensive])
  })
})

describe('composeLocationName', () => {
  it('is just the settlement when there is no village', () => {
    expect(composeLocationName('Վարդենիս')).toBe('Վարդենիս')
    expect(composeLocationName('Վարդենիս', '')).toBe('Վարդենիս')
    expect(composeLocationName('Վարդենիս', '   ')).toBe('Վարդենիս')
  })

  it('appends the village in the form customers read', () => {
    expect(composeLocationName('Վարդենիս', 'Շատվան')).toBe('Վարդենիս, գյուղ Շատվան')
  })

  it('trims both halves', () => {
    expect(composeLocationName('  Վարդենիս ', ' Շատվան ')).toBe('Վարդենիս, գյուղ Շատվան')
  })
})

describe('placementFor', () => {
  it('gives a Yerevan district no marz', () => {
    // Yerevan is a pseudo-region; a regionSlug here would list the truck on a
    // marz page that does not describe it.
    const placement = placementFor('kentron')
    expect(placement.districtSlug).toBe('kentron')
    expect(placement.citySlug).toBeUndefined()
    expect(placement.regionSlug).toBeUndefined()
  })

  it('resolves a city to its own marz', () => {
    const placement = placementFor('abovyan')
    expect(placement.citySlug).toBe('abovyan')
    expect(placement.districtSlug).toBeUndefined()
    expect(placement.regionSlug).toBe('kotayk')
  })
})
