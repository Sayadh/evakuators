import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The homepage «Լավագույն էվակուատորներ» strip keeps the order the server sent.
 *
 * Every other listing on this site is deliberately shuffled per page load, so
 * that no driver owns the top of a page forever. This one is the exception, and
 * it is the exception because the order is bought: the backend returns
 * placements newest purchase first, with `nulls: 'last'` so a legacy pick with
 * no purchase cannot displace someone who paid.
 *
 * `transform: recommendedWith(seed)` was doing exactly that displacement — the
 * driver who paid this morning could sit below one who paid nothing, and could
 * move on every refresh. It reads as a fairness feature, which is why it is
 * worth a test saying why it is absent here rather than a comment somebody
 * later "fixes" back.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const composables = readFileSync(`${ROOT}composables/useTowTrucks.ts`, 'utf8')
const service = readFileSync(`${ROOT}services/towTrucks.service.ts`, 'utf8')

function featuredBlock(): string {
  const start = composables.indexOf('export function useFeaturedTowTrucks')
  expect(start).toBeGreaterThan(-1)
  return composables.slice(start, composables.indexOf('export function', start + 10))
}

describe('featured strip', () => {
  it('does not re-sort what the server ordered by purchase', () => {
    expect(featuredBlock()).not.toContain('recommendedWith')
  })

  it('still shuffles every other listing', () => {
    // The guard against "fixed" meaning "removed everywhere".
    expect(composables.split('recommendedWith(useListingShuffleSeed())').length - 1).toBeGreaterThan(
      5,
    )
  })

  it('applies the limit in API mode, not only in mock mode', () => {
    // Harmless while a handful were marked by hand; a problem the moment
    // placements are sold, since the strip would render every one of them.
    expect(service).toContain('await towTruckRepository.getFeatured()).slice(0, limit)')
  })
})
