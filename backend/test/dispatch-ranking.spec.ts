import { describe, expect, it } from 'vitest'
import {
  compareCandidates,
  dispatchTier,
  matchesDispatchFilter,
  DISPATCH_LONG_WAIT_DAYS,
  type DispatchCandidateInput,
  type DispatchPlace,
  type RankedCandidate,
} from '../src/dispatch/dispatch-ranking'

/**
 * The order the dispatcher sees while someone is on the phone, and the reason
 * a driver will one day give for being unhappy with it. Both deserve tests.
 */

const ABOVYAN: DispatchPlace = { slug: 'abovyan', name: 'Աբովյան', type: 'city' }
const ARABKIR: DispatchPlace = { slug: 'arabkir', name: 'Արաբկիր', type: 'district' }

function truck(overrides: Partial<DispatchCandidateInput> = {}): DispatchCandidateInput {
  return {
    regionSlug: null,
    citySlug: null,
    districtSlug: null,
    servesAllArmenia: false,
    serviceAreas: [],
    ...overrides,
  }
}

describe('dispatchTier', () => {
  it('puts a driver based in the city in `local`', () => {
    expect(dispatchTier(truck({ citySlug: 'abovyan' }), ABOVYAN)).toBe('local')
  })

  it('matches a Yerevan district against districtSlug, not citySlug', () => {
    // The two are separate columns and a Yerevan truck has a district but the
    // city question does not apply to it.
    expect(dispatchTier(truck({ districtSlug: 'arabkir' }), ARABKIR)).toBe('local')
    expect(dispatchTier(truck({ citySlug: 'arabkir' }), ARABKIR)).toBeNull()
  })

  it('puts a driver who declared the area in `visiting`', () => {
    const declared = truck({ citySlug: 'yerevan', serviceAreas: [{ slug: 'abovyan', type: 'city' }] })
    expect(dispatchTier(declared, ABOVYAN)).toBe('visiting')
  })

  it('requires the TYPE to match too, not just the slug', () => {
    // A region and a city can share a name in this taxonomy; matching on slug
    // alone would put a marz-wide driver in a city's local list.
    const wrongType = truck({ serviceAreas: [{ slug: 'abovyan', type: 'region' }] })
    expect(dispatchTier(wrongType, ABOVYAN)).toBeNull()
  })

  it('prefers `local` over `visiting` when the driver is both', () => {
    // Being based there is the stronger fact. A driver who lives in Abovyan
    // AND lists it should not read as merely willing to drive out.
    const both = truck({ citySlug: 'abovyan', serviceAreas: [{ slug: 'abovyan', type: 'city' }] })
    expect(dispatchTier(both, ABOVYAN)).toBe('local')
  })

  it('falls back to `nationwide` for the whole-country flag', () => {
    expect(dispatchTier(truck({ servesAllArmenia: true }), ABOVYAN)).toBe('nationwide')
  })

  it('excludes a driver with nothing to do with the place', () => {
    // The screen must not offer someone who never said they would go there.
    expect(dispatchTier(truck({ citySlug: 'gyumri' }), ABOVYAN)).toBeNull()
  })
})

describe('compareCandidates', () => {
  const candidate = (over: Partial<RankedCandidate> = {}): RankedCandidate => ({
    tier: 'local',
    isFeatured: false,
    rating: 4.5,
    driverName: 'Ա',
    ...over,
  })

  it('orders the three tiers before anything else', () => {
    const visiting = candidate({ tier: 'visiting', isFeatured: true, rating: 5 })
    const local = candidate({ tier: 'local', isFeatured: false, rating: 1 })
    expect([visiting, local].sort(compareCandidates)[0]).toBe(local)
  })

  it('puts the drivers the operator marked as good first inside a tier', () => {
    const plain = candidate({ rating: 5, driverName: 'Բ' })
    const featured = candidate({ isFeatured: true, rating: 3, driverName: 'Ա' })
    expect([plain, featured].sort(compareCandidates)[0]).toBe(featured)
  })

  it('sorts an unrated driver BELOW a rated one', () => {
    // No reviews is not evidence of quality — a new profile must not outrank
    // someone with a record.
    const unrated = candidate({ rating: null, driverName: 'Ա' })
    const rated = candidate({ rating: 3.1, driverName: 'Բ' })
    expect([unrated, rated].sort(compareCandidates)[0]).toBe(rated)
  })

  it('is stable when everything ties, so the list does not reshuffle', () => {
    const first = candidate({ driverName: 'Աram' })
    const second = candidate({ driverName: 'Բoris' })
    expect([second, first].sort(compareCandidates).map((c) => c.driverName)).toEqual([
      'Աram',
      'Բoris',
    ])
  })
})

describe('matchesDispatchFilter', () => {
  const NOW = new Date('2026-09-09T12:00:00.000Z')
  const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

  const row = (over: Partial<{ isFeatured: boolean; lastDispatchedAt: Date | null; dispatchCount: number }> = {}) => ({
    isFeatured: false,
    lastDispatchedAt: daysAgo(2),
    dispatchCount: 5,
    ...over,
  })

  it('keeps everyone under "all"', () => {
    expect(matchesDispatchFilter(row(), 'all', NOW)).toBe(true)
  })

  it('finds the drivers who have never been given anything', () => {
    expect(matchesDispatchFilter(row({ dispatchCount: 0, lastDispatchedAt: null }), 'never-dispatched', NOW)).toBe(true)
    expect(matchesDispatchFilter(row({ dispatchCount: 1 }), 'never-dispatched', NOW)).toBe(false)
  })

  it('does NOT count a never-dispatched driver as "waiting a long time"', () => {
    // They are a separate and more urgent case; merging the two would hide the
    // smaller list inside the larger one.
    expect(matchesDispatchFilter(row({ dispatchCount: 0, lastDispatchedAt: null }), 'long-wait', NOW)).toBe(false)
  })

  it('surfaces a driver who has had nothing for a billing cycle', () => {
    // 30 days, because that is the month they paid for — the operator needs
    // them before the renewal conversation, not after.
    expect(matchesDispatchFilter(row({ lastDispatchedAt: daysAgo(DISPATCH_LONG_WAIT_DAYS) }), 'long-wait', NOW)).toBe(true)
    expect(matchesDispatchFilter(row({ lastDispatchedAt: daysAgo(DISPATCH_LONG_WAIT_DAYS - 1) }), 'long-wait', NOW)).toBe(false)
  })

  it('filters to the operator-marked drivers', () => {
    expect(matchesDispatchFilter(row({ isFeatured: true }), 'featured', NOW)).toBe(true)
    expect(matchesDispatchFilter(row(), 'featured', NOW)).toBe(false)
  })
})
