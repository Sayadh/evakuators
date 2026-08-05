import { describe, expect, it } from 'vitest'
import { staticSettlements } from '~/data/settlement'
import {
  findLocationExact,
  normalizeLocationQuery,
  searchLocations,
} from '~/utils/locationSearch'
import { resolveSettlementRouting } from '~/utils/settlements'

/** Shorthand: what does typing this term resolve to? */
const routeOf = (query: string): string | undefined => findLocationExact(query)?.route
const keyOf = (query: string): string | undefined => findLocationExact(query)?.key

describe('normalizeLocationQuery', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeLocationQuery('  Նոր   Հաճն ')).toBe('նոր հաճն')
  })

  it('treats the three dashes as one, for comparison only', () => {
    expect(normalizeLocationQuery('Գառնի–Գեղարդ')).toBe(normalizeLocationQuery('Գառնի-Գեղարդ'))
    expect(normalizeLocationQuery('Գառնի—Գեղարդ')).toBe(normalizeLocationQuery('Գառնի-Գեղարդ'))
  })
})

describe('cities and districts keep working', () => {
  it.each([
    ['Աբովյան', '/regions/kotayk/abovyan'],
    ['Abovyan', '/regions/kotayk/abovyan'],
    ['abovyan', '/regions/kotayk/abovyan'],
  ])('%s → %s', (query, route) => {
    expect(routeOf(query)).toBe(route)
  })

  it('resolves a city alias', () => {
    // From the aliases already in data/cities.ts
    expect(keyOf('ejmiatsin')).toBe('city:vagharshapat')
    expect(keyOf('echmiadzin')).toBe('city:vagharshapat')
    expect(keyOf('razdan')).toBe('city:hrazdan')
  })

  it('resolves a Yerevan district alias', () => {
    expect(keyOf('bangladesh')).toBe('district:malatia-sebastia')
    expect(keyOf('masiv')).toBe('district:nor-nork')
  })
})

describe('settlements bound to a service zone resolve to the corridor', () => {
  it.each([
    ['Գառնի', 'zone:garni-geghard'],
    ['Garni', 'zone:garni-geghard'],
    ['Գեղարդ', 'zone:garni-geghard'],
    ['Geghard', 'zone:garni-geghard'],
    ['Բջնի', 'zone:bjni-arzakan'],
    ['Bjni', 'zone:bjni-arzakan'],
    ['Արզական', 'zone:bjni-arzakan'],
    ['Arzakan', 'zone:bjni-arzakan'],
    ['Երասխ', 'zone:yeraskh'],
    ['Ենոքավան', 'zone:yenokavan'],
    ['Բյուրական', 'zone:byurakan-amberd'],
    ['Byurakan', 'zone:byurakan-amberd'],
    ['Ծաղկահովիտ', 'zone:aragats-tsaghkahovit'],
    ['Tsaghkahovit', 'zone:aragats-tsaghkahovit'],
    ['Վարդենիկ', 'zone:vardenik-tsakkar'],
    ['Vardenik', 'zone:vardenik-tsakkar'],
    ['Ծակքար', 'zone:vardenik-tsakkar'],
    ['Օձուն', 'zone:odzun-haghpat'],
    ['Odzun', 'zone:odzun-haghpat'],
    ['Հաղպատ', 'zone:odzun-haghpat'],
    ['Տաթև', 'zone:tatev-halidzor'],
    ['Tatev', 'zone:tatev-halidzor'],
    ['Հալիձոր', 'zone:tatev-halidzor'],
    ['Խնձորեսկ', 'zone:khndzoresk-kornidzor'],
    ['Khndzoresk', 'zone:khndzoresk-kornidzor'],
    ['Կոռնիձոր', 'zone:khndzoresk-kornidzor'],
    ['Գոշ', 'zone:gosh-haghartsin'],
    ['Gosh', 'zone:gosh-haghartsin'],
    ['Հաղարծին', 'zone:gosh-haghartsin'],
    ['Արենի', 'zone:areni-noravank'],
    ['Areni', 'zone:areni-noravank'],
  ])('%s → %s', (query, key) => {
    expect(keyOf(query)).toBe(key)
  })

  it('offers the corridor once, never the village and the corridor as two rows', () => {
    const results = searchLocations('Գառնի')
    const zoneRows = results.filter((r) => r.key === 'zone:garni-geghard')
    expect(zoneRows).toHaveLength(1)
    expect(results.some((r) => r.type === 'settlement' && r.name === 'Գառնի')).toBe(false)
  })

  it('routes the corridor URL, not a settlement URL', () => {
    expect(routeOf('Գեղարդ')).toBe('/regions/kotayk/garni-geghard')
  })
})

describe('landing settlements keep their own page', () => {
  it.each([
    ['Պտղնի', '/regions/kotayk/ptghni'],
    ['Ptghni', '/regions/kotayk/ptghni'],
    ['Ptxni', '/regions/kotayk/ptghni'],
    ['Առինջ', '/regions/kotayk/arinj'],
    ['Arinj', '/regions/kotayk/arinj'],
    ['Օշական', '/regions/aragatsotn/oshakan'],
    ['Oshakan', '/regions/aragatsotn/oshakan'],
    ['Կարճաղբյուր', '/regions/gegharkunik/karchaghbyur'],
    ['Karchaghbyur', '/regions/gegharkunik/karchaghbyur'],
    ['Karchaxbyur', '/regions/gegharkunik/karchaghbyur'],
  ])('%s → %s', (query, route) => {
    expect(routeOf(query)).toBe(route)
  })

  it('is typed as a settlement, not folded into its city', () => {
    expect(findLocationExact('Պտղնի')?.type).toBe('settlement')
  })
})

describe('the Ararat/Armavir conflicts give the city priority', () => {
  it('resolves Արարատ to the city, keeping its canonical URL', () => {
    expect(keyOf('Արարատ')).toBe('city:ararat')
    expect(routeOf('Արարատ')).toBe('/regions/ararat/ararat')
  })

  it('resolves Արմավիր to the city', () => {
    expect(keyOf('Արմավիր')).toBe('city:armavir')
    expect(routeOf('Արմավիր')).toBe('/regions/armavir/armavir')
  })
})

describe('same name in two regions', () => {
  it('returns both, distinguished by region name', () => {
    const results = searchLocations('Ակունք')
    expect(results.length).toBeGreaterThanOrEqual(2)
    const regions = new Set(results.map((r) => r.regionName))
    expect(regions.size).toBeGreaterThanOrEqual(2)
  })
})

describe('routing rules', () => {
  const bySlug = (slug: string) => staticSettlements.find((s) => s.slug === slug)!

  it('redirects a zone-bound settlement straight to the corridor', () => {
    const routing = resolveSettlementRouting(bySlug('garni'))
    expect(routing).toEqual({ kind: 'redirect', target: '/regions/kotayk/garni-geghard' })
  })

  it('renders a landing settlement and borrows its target city drivers', () => {
    const routing = resolveSettlementRouting(bySlug('ptghni'))
    expect(routing?.kind).toBe('landing')
    expect(routing).toMatchObject({ cityRoute: '/regions/kotayk/abovyan' })
  })

  it('leaves a plain settlement on the existing targetCityId flow', () => {
    const routing = resolveSettlementRouting(bySlug('balahovit'))
    expect(routing?.kind).toBe('city')
  })

  it('never invents a settlement URL for an alias', () => {
    // 'ptxni' is an alias of Պտղնի; it must resolve to the settlement's own
    // canonical route, never to a /ptxni URL of its own.
    expect(routeOf('ptxni')).toBe('/regions/kotayk/ptghni')
    expect(staticSettlements.some((s) => s.slug === 'ptxni')).toBe(false)
  })
})
