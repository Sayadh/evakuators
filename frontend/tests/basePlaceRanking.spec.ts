import { describe, expect, it } from 'vitest'
import {
  basePlaceCandidates,
  composeLocationName,
  isRouteBase,
  placementFor,
  primaryPlaceOptions,
  regionOfCandidate,
} from '~/utils/primaryArea'

/**
 * "Base place" here is the registration/dashboard concept — which city,
 * district or corridor a driver picks as their own base (`primaryArea.ts`).
 *
 * It used to also drive a listing-order boost ("based here" ranked above
 * "merely also covers it") on the city/district search pages. That boost is
 * gone — see `frontend/tests/listingShuffle.spec.ts` for what those pages do
 * now (fully random, no tiering at all) — but the base-place *picker* below is
 * unrelated and unaffected: a driver still states one base place, it is still
 * what a city/district page's listing is scoped to, it just no longer changes
 * the order within that listing.
 */

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

  it('gives a road corridor no city and no district, but keeps its marz', () => {
    // A driver who waits on «Արագած–Ծաղկահովիտ» is really there, and the card
    // should say so. `citySlug` is what the city pages filter on and there is
    // no page for a road, so both slugs stay empty — the truck appears on its
    // marz page and on no city page, which is true of it.
    const placement = placementFor('aragats-tsaghkahovit')

    expect(placement.citySlug).toBeUndefined()
    expect(placement.districtSlug).toBeUndefined()
    expect(placement.regionSlug).toBe('aragatsotn')
    // Validation-only: it tells the backend the emptiness was a choice rather
    // than an omission. Never stored — see assertPlacementIsServed.
    expect(placement.routeSlug).toBe('aragats-tsaghkahovit')
  })

  it('never lets a corridor reach citySlug', () => {
    // The one thing that was right about excluding corridors, and still is.
    for (const slug of ['aragats-tsaghkahovit', 'byurakan-amberd']) {
      expect(placementFor(slug).citySlug).toBeUndefined()
    }
  })
})

describe('the base picker offers corridors', () => {
  const AREAS = [
    { slug: 'ashtarak', name: 'Աշտարակ', type: 'city' },
    { slug: 'aragats-tsaghkahovit', name: 'Արագած–Ծաղկահովիտ', type: 'route' },
  ]

  it('keeps them among the candidates', () => {
    // They used to be filtered out, which left a moderator reviewing a
    // road-based driver with two selects and no honest answer in either.
    expect(basePlaceCandidates(AREAS).map((area) => area.slug)).toEqual([
      'ashtarak',
      'aragats-tsaghkahovit',
    ])
  })

  it('files them under their own marz, so the marz select can offer it', () => {
    expect(regionOfCandidate(AREAS[1]!)).toBe('aragatsotn')
  })

  it('lists them beside the settlements of that marz', () => {
    const options = primaryPlaceOptions(AREAS, 'aragatsotn')
    expect(options.map((option) => option.value)).toContain('aragats-tsaghkahovit')
    // The stored name, so the picker and the public profile cannot disagree.
    expect(options.find((option) => option.value === 'aragats-tsaghkahovit')?.label).toBe(
      'Արագած–Ծաղկահովիտ',
    )
  })

  it('can be told apart from a settlement, for the warning the picker shows', () => {
    expect(isRouteBase('aragats-tsaghkahovit')).toBe(true)
    expect(isRouteBase('ashtarak')).toBe(false)
  })
})
