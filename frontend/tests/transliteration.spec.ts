import { describe, expect, it } from 'vitest'
import { findLocationExact, searchLocations } from '~/utils/locationSearch'
import { toSearchKey } from '~/utils/transliteration'

const key = (value: string): string => toSearchKey(value.toLowerCase())

/**
 * Every group below must collapse to ONE key. Each row is a spelling a real
 * visitor might type: the Armenian name, the Latin slug, the Russian name, and
 * where relevant the informal Latin variants Armenians use in chat (`mexri`,
 * `ptxni`, `caxkadzor`).
 */
describe('toSearchKey collapses the three scripts', () => {
  it.each([
    ['Երևան', ['yerevan', 'Ереван', 'erevan']],
    ['Աբովյան', ['abovyan', 'Абовян']],
    ['Գյումրի', ['gyumri', 'Гюмри']],
    ['Վանաձոր', ['vanadzor', 'Ванадзор']],
    ['Հրազդան', ['hrazdan', 'Раздан', 'razdan']],
    ['Սևան', ['sevan', 'Севан']],
    ['Դիլիջան', ['dilijan', 'Дилижан']],
    ['Կապան', ['kapan', 'Капан']],
    ['Ջերմուկ', ['jermuk', 'Джермук']],
    ['Ծաղկաձոր', ['tsaghkadzor', 'Цахкадзор', 'caxkadzor']],
    ['Մեղրի', ['meghri', 'Мегри', 'mexri']],
    ['Գառնի', ['garni', 'Гарни']],
    ['Պտղնի', ['ptghni', 'Птгни', 'ptxni']],
    ['Ստեփանավան', ['stepanavan', 'Степанаван']],
  ])('%s', (armenian, others) => {
    for (const other of others) expect(key(other)).toBe(key(armenian))
  })

  it('ignores dashes, spaces and case', () => {
    expect(key('Գառնի–Գեղարդ')).toBe(key('garni-geghard'))
    expect(key('Գառնի Գեղարդ')).toBe(key('GARNI-GEGHARD'))
  })

  /**
   * Russian writes ծ as `дз` in «Эчмиадзин» where Armenian romanisation writes
   * `ts` — a letter rule cannot bridge that, and it does not have to: the city
   * already carries `ejmiatsin` and `echmiadzin` as hand-written aliases. This
   * is the documented division of labour, asserted so it stays true.
   */
  it('leaves the ts/dz mismatch to the hand-written aliases', () => {
    expect(key('Эчмиадзин')).not.toBe(key('Էջմիածին'))
    expect(findLocationExact('echmiadzin')?.key).toBe('city:vagharshapat')
  })

  it('does not collapse genuinely different names', () => {
    expect(key('Աբովյան')).not.toBe(key('Արտաշատ'))
    expect(key('Սևան')).not.toBe(key('Սիսիան'))
    expect(key('Կապան')).not.toBe(key('Կապս'))
  })
})

describe('search works in Armenian, Latin and Russian', () => {
  it.each([
    ['Երևան', 'Ереван', 'yerevan'],
    ['Աբովյան', 'Абовян', 'abovyan'],
    ['Գյումրի', 'Гюмри', 'gyumri'],
    ['Հրազդան', 'Раздан', 'hrazdan'],
    ['Վանաձոր', 'Ванадзор', 'vanadzor'],
  ])('%s / %s / %s reach the same place', (armenian, russian, latin) => {
    const target = findLocationExact(armenian)
    expect(target).not.toBeNull()
    expect(findLocationExact(russian)?.key).toBe(target!.key)
    expect(findLocationExact(latin)?.key).toBe(target!.key)
  })

  it('routes a Russian village name to its service zone', () => {
    // «Гарни» → the corridor, exactly as «Գառնի» and `garni` do
    expect(findLocationExact('Гарни')?.key).toBe('zone:garni-geghard')
    expect(findLocationExact('Гегард')?.key).toBe('zone:garni-geghard')
  })

  it('routes a Russian village name to its landing page', () => {
    expect(findLocationExact('Птгни')?.route).toBe('/regions/kotayk/ptghni')
  })

  it('offers Russian prefixes in autocomplete', () => {
    const results = searchLocations('Ерев')
    expect(results.some((result) => result.name === 'Երևան' || result.regionName === 'Երևան')).toBe(
      true,
    )
  })

  it('keeps city priority regardless of the script typed', () => {
    expect(findLocationExact('Арарат')?.key).toBe('city:ararat')
    expect(findLocationExact('Армавир')?.key).toBe('city:armavir')
  })
})
