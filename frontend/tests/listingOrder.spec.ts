import { describe, expect, it } from 'vitest'
import type { TowTruckCard } from '~/types/towTruck'
import { pickListingSeed, pinnedCount, repeatsAPosition } from '~/utils/listingOrder'
import { seededShuffle } from '~/utils/seededShuffle'

const truck = (id: number, promotedAt?: string): TowTruckCard =>
  ({ id, promotedAt }) as unknown as TowTruckCard

const ids = (list: TowTruckCard[]): number[] => list.map((t) => t.id)

describe('pinnedCount', () => {
  it('counts the paid placements sitting at the top', () => {
    expect(pinnedCount([truck(1, '2026-01-01'), truck(2, '2026-01-02'), truck(3)])).toBe(2)
  })

  it('is zero when nobody bought a placement', () => {
    expect(pinnedCount([truck(1), truck(2)])).toBe(0)
  })
})

describe('repeatsAPosition', () => {
  it('is true when anybody stands exactly where they stood', () => {
    expect(repeatsAPosition([truck(1), truck(2), truck(3)], [9, 2, 8], 0)).toBe(true)
  })

  it('is false when everybody moved', () => {
    expect(repeatsAPosition([truck(1), truck(2), truck(3)], [3, 1, 2], 0)).toBe(false)
  })

  it('ignores the pinned prefix — that position was sold, not shuffled', () => {
    // id 1 is in slot 0 both times, but slot 0 is a paid placement.
    expect(repeatsAPosition([truck(1), truck(2), truck(3)], [1, 3, 2], 1)).toBe(false)
  })

  it('treats a first visit as no repeat — there is nothing to repeat', () => {
    expect(repeatsAPosition([truck(1), truck(2)], null, 0)).toBe(false)
  })

  it('treats a changed list length as no repeat', () => {
    // A driver joined or left since; the slots are not comparable.
    expect(repeatsAPosition([truck(1), truck(2), truck(3)], [1, 2], 0)).toBe(false)
  })
})

describe('pickListingSeed', () => {
  const list = [1, 2, 3, 4, 5, 6, 7].map((id) => truck(id))
  const orderFor = (seed: number): TowTruckCard[] => seededShuffle(list, seed)

  it('leaves nobody in their previous slot, from any starting seed', () => {
    // The actual complaint: the same driver in the same place twice running.
    for (let seed = 1; seed <= 200; seed += 1) {
      const previous = ids(orderFor(seed))
      const { ordered } = pickListingSeed(seed, previous, orderFor)

      expect(repeatsAPosition(ordered, previous, 0), `seed ${seed}`).toBe(false)
    }
  })

  it('returns the seed it settled on, so the page renders what was checked', () => {
    const previous = ids(orderFor(42))
    const { seed, ordered } = pickListingSeed(42, previous, orderFor)

    expect(ids(orderFor(seed))).toEqual(ids(ordered))
  })

  it('keeps the first seed when it already deranges — no needless churn', () => {
    const { seed } = pickListingSeed(42, null, orderFor)
    expect(seed).toBe(42)
  })

  it('gives up rather than looping when no derangement exists', () => {
    // One driver can only ever be in slot 0. The guarantee is impossible and
    // the function must still return, not spin.
    const single = [truck(1)]
    const { ordered } = pickListingSeed(7, [1], (s) => seededShuffle(single, s))

    expect(ids(ordered)).toEqual([1])
  })
})
