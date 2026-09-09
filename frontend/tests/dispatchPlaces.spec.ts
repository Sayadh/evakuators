import { describe, expect, it } from 'vitest'
import {
  rememberDispatchPlace,
  searchDispatchPlaces,
  DISPATCH_RECENT_LIMIT,
  type DispatchPlace,
} from '../utils/dispatchPlaces'

/**
 * What the operator types while somebody is on the phone. A wrong suggestion
 * accepted in a hurry sends a truck to the wrong town, so the matching is
 * deliberately literal rather than fuzzy — these tests pin that.
 */

const PLACES: DispatchPlace[] = [
  { slug: 'abovyan', name: 'Աբովյան', type: 'city', context: 'Կոտայք' },
  { slug: 'arabkir', name: 'Արաբկիր', type: 'district', context: 'Երևան' },
  { slug: 'nor-abovyan', name: 'Նոր Աբովյան', type: 'city', context: 'Կոտայք' },
  { slug: 'gyumri', name: 'Գյումրի', type: 'city', context: 'Շիրակ' },
]

describe('searchDispatchPlaces', () => {
  it('finds a place from the first letters', () => {
    expect(searchDispatchPlaces(PLACES, 'աբով').map((p) => p.slug)).toContain('abovyan')
  })

  it('ranks a prefix match above one that merely contains the letters', () => {
    // Typing «աբով» means Աբովյան. Having to look past «Նոր Աբովյան» to find it
    // is exactly the half-second that gets typed past.
    expect(searchDispatchPlaces(PLACES, 'աբով')[0]!.slug).toBe('abovyan')
  })

  it('returns nothing for an empty query rather than the whole taxonomy', () => {
    expect(searchDispatchPlaces(PLACES, '   ')).toEqual([])
  })

  it('does not guess at a typo', () => {
    // No fuzzy matching on purpose: a dispatcher who has to verify every row is
    // slower than one who types two more letters.
    expect(searchDispatchPlaces(PLACES, 'աբվո')).toEqual([])
  })

  it('caps the list to what someone can read at a glance', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      slug: `x${i}`,
      name: `Աաա${i}`,
      type: 'city' as const,
    }))
    expect(searchDispatchPlaces(many, 'աաա').length).toBeLessThanOrEqual(6)
  })
})

describe('rememberDispatchPlace', () => {
  const [abovyan, arabkir, norAbovyan, gyumri] = PLACES

  it('puts the newest first', () => {
    expect(rememberDispatchPlace([arabkir!], abovyan!)[0]!.slug).toBe('abovyan')
  })

  it('moves a repeat to the front instead of duplicating it', () => {
    const recent = rememberDispatchPlace([abovyan!, arabkir!], abovyan!)
    expect(recent.map((p) => p.slug)).toEqual(['abovyan', 'arabkir'])
  })

  it('keeps a same-named place of a different type separate', () => {
    // Slug alone is not the identity: a city and a marz can share one.
    const asRegion: DispatchPlace = { slug: 'abovyan', name: 'Աբովյան', type: 'region' }
    expect(rememberDispatchPlace([abovyan!], asRegion)).toHaveLength(2)
  })

  it('never grows past the chip row', () => {
    let recent: DispatchPlace[] = []
    for (const place of [abovyan!, arabkir!, norAbovyan!, gyumri!, abovyan!, arabkir!]) {
      recent = rememberDispatchPlace(recent, place)
    }
    expect(recent).toHaveLength(DISPATCH_RECENT_LIMIT)
  })
})
