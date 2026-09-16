import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { compareCandidates, type RankedCandidate } from '../src/dispatch/dispatch-ranking'

/**
 * "Our drivers" rank above everyone except a driver holding a paid placement.
 *
 * The order of the three rules is the product decision, and it is the kind
 * that gets quietly inverted by a later edit: a placement is SOLD, so it must
 * outrank a relationship that was not. Below that, a partner outranks a
 * stranger. Below that, rating decides as it always did.
 */
const candidate = (patch: Partial<RankedCandidate>): RankedCandidate => ({
  tier: 'local',
  isFeatured: false,
  isPartner: false,
  rating: null,
  driverName: 'Բ',
  ...patch,
})

const firstOf = (a: RankedCandidate, b: RankedCandidate): RankedCandidate =>
  [a, b].sort(compareCandidates)[0]!

describe('compareCandidates — partner drivers', () => {
  it('puts our driver above a stranger in the same tier', () => {
    const ours = candidate({ isPartner: true, driverName: 'Ours' })
    const other = candidate({ driverName: 'Other' })

    expect(firstOf(other, ours).driverName).toBe('Ours')
  })

  it('still puts a paid placement above our driver — the placement was bought', () => {
    const paid = candidate({ isFeatured: true, driverName: 'Paid' })
    const ours = candidate({ isPartner: true, driverName: 'Ours' })

    expect(firstOf(ours, paid).driverName).toBe('Paid')
  })

  it('beats a higher rating, because it is checked before rating', () => {
    const ours = candidate({ isPartner: true, rating: 3, driverName: 'Ours' })
    const betterRated = candidate({ rating: 5, driverName: 'Better' })

    expect(firstOf(betterRated, ours).driverName).toBe('Ours')
  })

  it('never crosses the local split: a local stranger beats a partner from elsewhere', () => {
    // Being based here is the outer split. A partner two towns away is still
    // two towns away, and the relationship must not buy past distance.
    const localStranger = candidate({ tier: 'local', driverName: 'Local' })
    const visitingPartner = candidate({ tier: 'visiting', isPartner: true, driverName: 'Far' })

    expect(firstOf(visitingPartner, localStranger).driverName).toBe('Local')
  })

  it('does not let a placement bought elsewhere jump a local driver either', () => {
    // What was sold is the top of the driver's OWN town — the same rule the
    // public listing applies through `isPromotedAt`.
    const localStranger = candidate({ tier: 'local', driverName: 'Local' })
    const visitingPaid = candidate({ tier: 'visiting', isFeatured: true, driverName: 'Far' })

    expect(firstOf(visitingPaid, localStranger).driverName).toBe('Local')
  })

  it('keeps visiting ahead of nationwide among everyone who is not local', () => {
    const visiting = candidate({ tier: 'visiting', driverName: 'Nearer' })
    const nationwide = candidate({ tier: 'nationwide', driverName: 'Anywhere' })

    expect(firstOf(nationwide, visiting).driverName).toBe('Nearer')
  })

  /**
   * The whole point of the rewrite: the dispatcher and the customer see one
   * ordering rule, not two that drift. This is the public city page's
   * `localRank` written out — paid, ours, based here, everyone else — and it
   * must hold end to end in one list.
   */
  it('matches the public city page: paid, ours, local, then the rest', () => {
    const list = [
      candidate({ tier: 'nationwide', driverName: 'Anywhere' }),
      candidate({ tier: 'local', driverName: 'Local' }),
      candidate({ tier: 'local', isFeatured: true, driverName: 'Paid' }),
      candidate({ tier: 'visiting', isPartner: true, driverName: 'OursFar' }),
      candidate({ tier: 'local', isPartner: true, driverName: 'OursHere' }),
    ]

    expect([...list].sort(compareCandidates).map((c) => c.driverName)).toEqual([
      'Paid',
      'OursHere',
      'Local',
      'OursFar',
      'Anywhere',
    ])
  })

  /**
   * The coordinate search is not this comparator's business at all.
   *
   * `listCandidatesByCoordinates` sorts by `distanceMeters` and nothing else —
   * when a dispatcher has a pin on a map, the only question is who can be
   * there soonest, and neither a placement nor a relationship changes that.
   * Asserted on the source because the ordering lives in the service, and the
   * risk is not that the sort is wrong today but that somebody later reaches
   * for `compareCandidates` to "make it consistent" with the place search.
   */
  it('is not used by the coordinate search, which orders by distance alone', () => {
    const service = readFileSync(
      fileURLToPath(new URL('../src/dispatch/dispatch.service.ts', import.meta.url)),
      'utf8',
    )
    const byCoordinates = service.slice(service.indexOf('listCandidatesByCoordinates'))

    expect(byCoordinates).toContain('a.distanceMeters - b.distanceMeters')
    expect(byCoordinates).not.toContain('compareCandidates')
  })

  it('falls through to rating when both are ours', () => {
    const better = candidate({ isPartner: true, rating: 5, driverName: 'Better' })
    const worse = candidate({ isPartner: true, rating: 2, driverName: 'Worse' })

    expect(firstOf(worse, better).driverName).toBe('Better')
  })
})
