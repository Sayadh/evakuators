import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SortOption } from '~/types/enums'
import type { TowTruckCard } from '~/types/towTruck'
import { seededShuffle } from '~/utils/seededShuffle'
import { sortTowTrucks } from '~/utils/towTruckFilters'

/**
 * Inside a town, the order is random rather than ranked.
 *
 * The smoothed rating separated drivers by hundredths, which made one fixed
 * queue per town: the same two or three profiles on top of it every time, and
 * everyone below them never called — so never reviewed, so never moved. The
 * ordering was quietly deciding who got work.
 *
 * Most listings still keep one coarse group — a half-point rating band — and
 * shuffle within it (`sortTowTrucks`'s default `tiered: true`). The city and
 * district search pages are the one exception: `tiered: false` drops the band
 * too, so on those two pages the order is a flat shuffle with rating playing
 * no part at all. These tests are about the properties that make both modes
 * safe: the shuffle is uniform enough to be fair, reproducible enough to
 * survive hydration, and never applied where a customer asked for a specific
 * order.
 */

function truck(id: number, overrides: Partial<TowTruckCard> = {}): TowTruckCard {
  return {
    id,
    slug: `truck-${id}`,
    driverName: `Վարորդ ${id}`,
    phone: '+37491000001',
    location: { name: 'Աբովյան', citySlug: 'abovyan' },
    vehicle: { brand: 'Isuzu', year: 2018, type: 'flatbed', capacityTons: 3 },
    services: [],
    works24Hours: false,
    rating: { average: 4.3, count: 5 },
    ...overrides,
  } as unknown as TowTruckCard
}

const TEN = Array.from({ length: 10 }, (_, index) => truck(index + 1))

describe('seededShuffle', () => {
  it('is reproducible for a seed, which is what makes SSR safe', () => {
    // The server and the browser run this with the same seed from the payload.
    // If it were not reproducible, hydration would find a different list than
    // the one it was told to expect.
    expect(seededShuffle(TEN, 12345)).toEqual(seededShuffle(TEN, 12345))
  })

  it('gives a different order for a different seed', () => {
    expect(seededShuffle(TEN, 1)).not.toEqual(seededShuffle(TEN, 2))
  })

  it('keeps every element exactly once', () => {
    const ids = seededShuffle(TEN, 99).map((item) => item.id).sort((a, b) => a - b)
    expect(ids).toEqual(TEN.map((item) => item.id))
  })

  it('does not mutate its input', () => {
    // The callers are Vue computeds over reactive arrays; shuffling in place
    // would rewrite the store's own data on every render.
    const original = [...TEN]
    seededShuffle(TEN, 7)
    expect(TEN).toEqual(original)
  })

  it('reaches first place from every position, roughly evenly', () => {
    // The property that matters to a driver. A biased shuffle — the
    // `sort(() => Math.random() - 0.5)` idiom is one — would leave somebody
    // quietly always near the top, which is the thing this change exists to
    // stop.
    const firstPlaces = new Map<number, number>()
    const runs = 4000

    for (let seed = 0; seed < runs; seed += 1) {
      const winner = seededShuffle(TEN, seed)[0]!.id
      firstPlaces.set(winner, (firstPlaces.get(winner) ?? 0) + 1)
    }

    // Every driver wins sometimes...
    expect(firstPlaces.size).toBe(TEN.length)

    // ...and nobody wins wildly more often than the 10% they are due. A
    // generous band, because this is a fairness check and not a test of the
    // generator's statistics.
    const expected = runs / TEN.length
    for (const count of firstPlaces.values()) {
      expect(count).toBeGreaterThan(expected * 0.6)
      expect(count).toBeLessThan(expected * 1.4)
    }
  })
})

describe('the Recommended order, tiered (every listing except the search pages)', () => {
  it('shuffles equally-placed drivers instead of ranking them', () => {
    const orders = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        sortTowTrucks(TEN, SortOption.Recommended, seed)
          .map((item) => item.id)
          .join(','),
      ),
    )

    expect(orders.size).toBeGreaterThan(1)
  })

  it('keeps a badly-rated driver below the rest, every time', () => {
    // The band is coarse on purpose, but it is not nothing: 8 × 3.2 smooths to
    // 3.50 and lands a band below everyone else.
    const bad = truck(99, { rating: { average: 3.2, count: 8 } as never })

    for (let seed = 0; seed < 50; seed += 1) {
      const sorted = sortTowTrucks([bad, ...TEN], SortOption.Recommended, seed)
      expect(sorted.at(-1)!.id).toBe(99)
    }
  })

  it('treats an unrated driver as an ordinary one', () => {
    // A new driver buried at the bottom never gets called, so never gets
    // reviewed, and stays buried — the prior exists to prevent exactly that,
    // and banding must not undo it.
    const fresh = truck(50, { rating: undefined })
    const wins = new Set<number>()

    for (let seed = 0; seed < 200; seed += 1) {
      wins.add(sortTowTrucks([...TEN, fresh], SortOption.Recommended, seed)[0]!.id)
    }

    expect(wins.has(50)).toBe(true)
  })

  it('is deterministic when no seed is given', () => {
    // Mock mode and every test take this path, and so does any caller that
    // wants a reproducible list.
    expect(sortTowTrucks(TEN, SortOption.Recommended).map((item) => item.id)).toEqual(
      sortTowTrucks(TEN, SortOption.Recommended).map((item) => item.id),
    )
  })

  it('never shuffles the price sort', () => {
    // The customer asked for cheapest first. Two drivers on the same price
    // swapping places between refreshes would read as the sort being broken.
    const priced = [
      truck(1, { startingPrice: 5000 } as never),
      truck(2, { startingPrice: 3000 } as never),
      truck(3, { startingPrice: 4000 } as never),
    ]

    for (let seed = 0; seed < 20; seed += 1) {
      expect(sortTowTrucks(priced, SortOption.Price, seed).map((t) => t.id)).toEqual([2, 3, 1])
    }
  })
})

describe('the Recommended order, flat (city and district search pages)', () => {
  // `applyTowTruckFilters` is what these two pages actually call; `tiered:
  // false` on `sortTowTrucks` directly is exercised here because it is the
  // one line that decides the behaviour, and because `applyTowTruckFilters`
  // also filters, which would obscure the ordering assertion below.

  it('ignores rating entirely — a badly-rated driver is not pinned to the bottom', () => {
    const bad = truck(99, { rating: { average: 1, count: 40 } as never })
    const great = TEN.map((item) => ({ ...item, rating: { average: 5, count: 40 } }))
    const winners = new Set<number>()

    for (let seed = 0; seed < 200; seed += 1) {
      winners.add(sortTowTrucks([bad, ...great], SortOption.Recommended, seed, false)[0]!.id)
    }

    // If rating still decided anything, 99 could never win.
    expect(winners.has(99)).toBe(true)
  })

  it('is exactly the seeded shuffle, with no re-sort on top of it', () => {
    for (const seed of [1, 2, 3]) {
      expect(sortTowTrucks(TEN, SortOption.Recommended, seed, false)).toEqual(
        seededShuffle(TEN, seed),
      )
    }
  })

  it('still never shuffles the price sort', () => {
    const priced = [
      truck(1, { startingPrice: 5000 } as never),
      truck(2, { startingPrice: 3000 } as never),
      truck(3, { startingPrice: 4000 } as never),
    ]

    expect(sortTowTrucks(priced, SortOption.Price, 7, false).map((t) => t.id)).toEqual([2, 3, 1])
  })
})

describe('the seed reaches both runtimes', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

  it('comes from useState, so it travels in the payload', () => {
    // `Math.random()` at render time would produce one order on the server and
    // another in the browser — a hydration mismatch, which Vue resolves by
    // silently force-patching the DOM or by visibly reshuffling a moment after
    // the page appears. `useState` is created once, server-side, and serialised.
    const composable = read('composables/useListingShuffleSeed.ts')

    expect(composable).toContain('useState<number>(')
    expect(composable).toContain("'listing-shuffle-seed'")
  })

  it('is read in setup, not inside the transform or the computed', () => {
    // `useState` needs a Nuxt context. `useAsyncData`'s transform runs when the
    // request resolves, outside setup, so the value has to be captured first
    // and closed over.
    const lists = read('composables/useTowTrucks.ts')

    // Every call site, not merely one of them. There are half a dozen listing
    // composables and they are added to over time; a new one wired with a
    // constant would silently give that page a fixed order forever, which is
    // the exact behaviour this change removes — and a `toContain` would not
    // notice, because the other five still pass.
    expect(lists).toContain('recommendedWith(useListingShuffleSeed())')

    // And EVERY listing takes it. There are half a dozen of these composables
    // and they are added to over time; a new one wired with a constant would
    // silently give that page a fixed order forever — and a `toContain` alone
    // would not notice, because the other five still match.
    //
    // Scanned on the `transform:` lines, which are the call sites; the
    // function's own declaration mentions the name too.
    const transforms = lists.split('\n').filter((line) => line.includes('transform:'))
    expect(transforms.length).toBeGreaterThan(3)
    for (const line of transforms) {
      expect(line).toContain('recommendedWith(useListingShuffleSeed())')
    }

    const filters = read('composables/useTowTruckFilters.ts')
    expect(filters).toContain('const seed = useListingShuffleSeed()')
  })
})
