import { describe, expect, it } from 'vitest'
import {
  rememberDispatchPlace,
  searchDispatchPlaces,
  DISPATCH_RECENT_LIMIT,
  type DispatchPlace,
} from '../utils/dispatchPlaces'

/**
 * What the operator types while somebody is on the phone.
 *
 * These run against the REAL taxonomy rather than a fixture, because the whole
 * point of this module now is that it is backed by the site's own location
 * index instead of a private list of its own. A fixture would test the mapping
 * and quietly stop noticing the three failures that actually happened on the
 * first day of use: Latin input finding nothing, «Երևան» finding nothing, and
 * villages and corridors being absent entirely.
 */
describe('searchDispatchPlaces — scripts', () => {
  it('finds a city typed in Armenian', () => {
    expect(searchDispatchPlaces('աբովյան').map((p) => p.slug)).toContain('abovyan')
  })

  it('finds the same city typed in Latin', () => {
    // The failure that started this: a dispatcher typing one-handed while
    // somebody is talking does not stop to switch keyboard layout.
    expect(searchDispatchPlaces('abov').map((p) => p.slug)).toContain('abovyan')
  })

  it('finds it typed in Russian', () => {
    expect(searchDispatchPlaces('Абовян').map((p) => p.slug)).toContain('abovyan')
  })
})

describe('searchDispatchPlaces — what is in the index', () => {
  it('offers Yerevan itself, not only its districts', () => {
    // Yerevan is a pseudo-region, not a city row, so a list built from
    // regions + cities + districts left out the most-typed word on the screen.
    const yerevan = searchDispatchPlaces('երևան').find((p) => p.slug === 'yerevan')
    expect(yerevan).toMatchObject({ type: 'region', name: 'Երևան' })
  })

  it('offers Yerevan for the Latin spelling too', () => {
    expect(searchDispatchPlaces('erevan').map((p) => p.slug)).toContain('yerevan')
    expect(searchDispatchPlaces('yerevan').map((p) => p.slug)).toContain('yerevan')
  })

  it('offers a Yerevan district', () => {
    expect(searchDispatchPlaces('արաբկիր').map((p) => p.slug)).toContain('arabkir')
  })

  it('offers a marz', () => {
    const kotayk = searchDispatchPlaces('կոտայք').find((p) => p.slug === 'kotayk')
    expect(kotayk).toMatchObject({ type: 'region' })
  })
})

describe('searchDispatchPlaces — matching target', () => {
  it('gives every suggestion a type a driver can actually declare', () => {
    // `serviceAreas` only ever holds these four. A suggestion carrying
    // `settlement` or `zone` would be compared literally against that JSON and
    // silently return nobody.
    const allowed = new Set(['city', 'district', 'region', 'route'])
    for (const query of ['աբով', 'երևան', 'կոտայք', 'գառնի', 'պտղնի', 'gyumri']) {
      for (const place of searchDispatchPlaces(query)) {
        expect(allowed.has(place.type)).toBe(true)
      }
    }
  })

  it('keeps the name the caller said while matching on what serves it', () => {
    // A village is a real answer to "where are you" and a thing no driver
    // declares. The referral should record «Պտղնի»; the search should look for
    // the drivers of the city that covers it.
    const results = searchDispatchPlaces('պտղնի')
    expect(results.length).toBeGreaterThan(0)
    const ptghni = results[0]!
    expect(ptghni.name).toBe('Պտղնի')
    expect(ptghni.type).toBe('city')
    expect(ptghni.slug).not.toBe('ptghni')
  })

  it('resolves a corridor to `route`, the stored spelling', () => {
    // A corridor is a `zone` as a page and a `route` as a service area. The
    // stored spelling is the one that has to travel to the backend.
    const garni = searchDispatchPlaces('գառնի')[0]
    expect(garni).toMatchObject({ type: 'route' })
  })
})

describe('searchDispatchPlaces — the marz expansion', () => {
  it('carries a marz\'s own towns and corridors', () => {
    // The backend has no geography, so a marz that travels alone matches only
    // the few drivers who ticked the marz itself — not the ones who listed its
    // towns, which is how coverage is actually stored.
    const kotayk = searchDispatchPlaces('կոտայք').find((p) => p.slug === 'kotayk')
    expect(kotayk?.regionCitySlugs).toContain('abovyan')
    expect(kotayk?.regionCitySlugs!.length).toBeGreaterThan(1)
  })

  it('sends no expansion for Yerevan, which the server answers itself', () => {
    // A pseudo-region: its "cities" are districts with no shared slug, so there
    // is nothing to expand into and `findStaticRegion('yerevan')` is undefined.
    const yerevan = searchDispatchPlaces('երևան').find((p) => p.slug === 'yerevan')
    expect(yerevan?.type).toBe('region')
    expect(yerevan?.regionCitySlugs).toEqual([])
  })

  it('sends no expansion for anything that is not a marz', () => {
    const abovyan = searchDispatchPlaces('աբովյան').find((p) => p.slug === 'abovyan')
    expect(abovyan?.type).toBe('city')
    expect(abovyan?.regionCitySlugs).toBeUndefined()
  })
})

describe('searchDispatchPlaces — the list itself', () => {
  it('returns nothing for a single character', () => {
    // One letter matches half the country; the index requires two.
    expect(searchDispatchPlaces('ա')).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(searchDispatchPlaces('')).toEqual([])
    expect(searchDispatchPlaces('   ')).toEqual([])
  })

  it('caps the list at what a person reads while talking', () => {
    expect(searchDispatchPlaces('ա').length).toBeLessThanOrEqual(6)
    expect(searchDispatchPlaces('ար', 3).length).toBeLessThanOrEqual(3)
  })

  it('offers one row per destination, never two that do the same thing', () => {
    const results = searchDispatchPlaces('գառնի')
    const keys = results.map((p) => `${p.type}:${p.slug}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('rememberDispatchPlace', () => {
  const abovyan: DispatchPlace = { slug: 'abovyan', name: 'Աբովյան', type: 'city' }
  const arabkir: DispatchPlace = { slug: 'arabkir', name: 'Արաբկիր', type: 'district' }

  it('puts the newest first', () => {
    expect(rememberDispatchPlace([arabkir], abovyan).map((p) => p.slug)).toEqual([
      'abovyan',
      'arabkir',
    ])
  })

  it('moves a repeat to the front instead of duplicating it', () => {
    const result = rememberDispatchPlace([arabkir, abovyan], abovyan)
    expect(result.map((p) => p.slug)).toEqual(['abovyan', 'arabkir'])
  })

  it('treats the same slug with a different type as a different place', () => {
    // Slugs are unique per type, not globally — a city and a marz can share one.
    const asRegion: DispatchPlace = { slug: 'abovyan', name: 'Աբովյան', type: 'region' }
    expect(rememberDispatchPlace([abovyan], asRegion)).toHaveLength(2)
  })

  it('never grows past the limit', () => {
    let recent: DispatchPlace[] = []
    for (let i = 0; i < DISPATCH_RECENT_LIMIT + 3; i += 1) {
      recent = rememberDispatchPlace(recent, { slug: `c${i}`, name: `C${i}`, type: 'city' })
    }
    expect(recent).toHaveLength(DISPATCH_RECENT_LIMIT)
    expect(recent[0]!.slug).toBe(`c${DISPATCH_RECENT_LIMIT + 2}`)
  })
})
