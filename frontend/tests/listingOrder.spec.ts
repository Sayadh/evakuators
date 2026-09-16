import { describe, expect, it } from 'vitest'
import type { TowTruckCard } from '~/types/towTruck'
import { pickListingSeed, repeatsAPosition } from '~/utils/listingOrder'
import { seededShuffle } from '~/utils/seededShuffle'

const truck = (id: number, rank = 1): TowTruckCard =>
  ({ id, rank }) as unknown as TowTruckCard

/** Test lists carry their own rank, so the group logic can be exercised directly */
const rankOf = (t: TowTruckCard): number => (t as unknown as { rank: number }).rank

const ids = (list: TowTruckCard[]): number[] => list.map((t) => t.id)

describe('repeatsAPosition', () => {
  it('is true when somebody who could have moved did not', () => {
    const ordered = [truck(1), truck(2), truck(3)]
    expect(repeatsAPosition(ordered, [9, 2, 8], rankOf)).toBe(true)
  })

  it('is false when everyone who could move did', () => {
    const ordered = [truck(1), truck(2), truck(3)]
    expect(repeatsAPosition(ordered, [3, 1, 2], rankOf)).toBe(false)
  })

  /**
   * The bug this file was rewritten for. One local driver on a town page owns
   * slot 0 whatever the shuffle does — asking them to leave it asks for the
   * impossible, and the impossible was being asked on nearly every page.
   */
  it('ignores a driver who is alone in their rank — that slot cannot change', () => {
    const ordered = [truck(1, 2), truck(2, 3), truck(3, 3)]
    // id 1 is in slot 0 both times, but rank 2 has only one member.
    expect(repeatsAPosition(ordered, [1, 3, 2], rankOf)).toBe(false)
  })

  it('still catches a repeat inside a rank that has room to move', () => {
    const ordered = [truck(1, 2), truck(2, 3), truck(3, 3)]
    expect(repeatsAPosition(ordered, [1, 2, 3], rankOf)).toBe(true)
  })

  it('ignores paid placements even when several hold one', () => {
    // Rank 0 is ordered by purchase date, not by the shuffle. Somebody bought
    // that position.
    const ordered = [truck(1, 0), truck(2, 0), truck(3, 1), truck(4, 1)]
    expect(repeatsAPosition(ordered, [1, 2, 4, 3], rankOf)).toBe(false)
  })

  it('treats a first visit, and a changed list length, as no repeat', () => {
    expect(repeatsAPosition([truck(1), truck(2)], null, rankOf)).toBe(false)
    expect(repeatsAPosition([truck(1), truck(2)], [1], rankOf)).toBe(false)
  })
})

describe('pickListingSeed', () => {
  const list = [1, 2, 3, 4, 5, 6, 7].map((id) => truck(id))
  const orderFor = (seed: number): TowTruckCard[] => seededShuffle(list, seed)

  it('leaves nobody in their previous slot, from any starting seed', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const previous = ids(orderFor(seed))
      const { ordered } = pickListingSeed(seed, previous, orderFor, rankOf)

      expect(repeatsAPosition(ordered, previous, rankOf), `seed ${seed}`).toBe(false)
    }
  })

  it('returns the seed it settled on, so the page renders what was checked', () => {
    const previous = ids(orderFor(42))
    const { seed, ordered } = pickListingSeed(42, previous, orderFor, rankOf)

    expect(ids(orderFor(seed))).toEqual(ids(ordered))
  })

  it('keeps the first seed when it already deranges — no needless churn', () => {
    const { seed } = pickListingSeed(42, null, orderFor, rankOf)
    expect(seed).toBe(42)
  })

  /**
   * The shape that used to exhaust all 60 attempts on every single load: one
   * driver who owns the top slot, two who can swap below them. It must settle
   * immediately once the fixed slot is excluded.
   */
  it('settles on a town page where only the lower slots can move', () => {
    const town = [truck(1, 2), truck(2, 3), truck(3, 3)]
    const order = (seed: number): TowTruckCard[] => [
      town[0] as TowTruckCard,
      ...seededShuffle(town.slice(1), seed),
    ]

    for (let seed = 1; seed <= 50; seed += 1) {
      const previous = ids(order(seed))
      const { ordered } = pickListingSeed(seed, previous, order, rankOf)

      expect(ids(ordered)[0], `seed ${seed}`).toBe(1)
      expect(repeatsAPosition(ordered, previous, rankOf), `seed ${seed}`).toBe(false)
    }
  })

  it('gives up rather than looping when nothing can move', () => {
    const single = [truck(1)]
    const { ordered } = pickListingSeed(7, [1], (s) => seededShuffle(single, s), rankOf)

    expect(ids(ordered)).toEqual([1])
  })
})
