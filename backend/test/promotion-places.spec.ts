import { describe, expect, it } from 'vitest'
import { promotionPlaces } from '../src/promotions/promotion-places'

/**
 * The pages each product is explained by. The area list has to be exactly the
 * pages `listing-order.ts` ranks the driver on — a name here that the ranking
 * ignores would be a promise the listing does not keep.
 */
const ARAM = {
  citySlug: null,
  districtSlug: 'nor-nork',
  locationName: 'Նոր Նորք',
  serviceAreas: [
    { name: 'Նոր Նորք', slug: 'nor-nork', type: 'district' },
    { name: 'Քանաքեռ-Զեյթուն', slug: 'kanaker-zeytun', type: 'district' },
    { name: 'Էրեբունի', slug: 'erebuni', type: 'district' },
    { name: 'Աբովյան', slug: 'abovyan', type: 'city' },
    { name: 'Կոտայք', slug: 'kotayk', type: 'region' },
    { name: 'Գառնի–Գեղարդ', slug: 'garni-geghard', type: 'route' },
    { name: 'Էրեբունի', slug: 'erebuni', type: 'district' },
  ],
}

describe('promotionPlaces', () => {
  it('names the base as the home page', () => {
    expect(promotionPlaces(ARAM).home).toEqual({ type: 'district', slug: 'nor-nork', name: 'Նոր Նորք' })
  })

  it('lists the other cities and districts — not the base, a marz, a corridor or a duplicate', () => {
    expect(promotionPlaces(ARAM).area.map((p) => p.slug)).toEqual(['kanaker-zeytun', 'erebuni', 'abovyan'])
  })

  it('has no home page for a base that is no town', () => {
    const places = promotionPlaces({ ...ARAM, districtSlug: null })
    expect(places.home).toBeUndefined()
    expect(places.area.map((p) => p.slug)).toContain('nor-nork')
  })

  it('survives an empty or missing coverage list', () => {
    expect(promotionPlaces({ ...ARAM, serviceAreas: null }).area).toEqual([])
  })
})
