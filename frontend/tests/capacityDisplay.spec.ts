import { describe, expect, it } from 'vitest'
import {
  CAPACITY_RANGE_OPTIONS,
  capacityDisplayText,
  representativeCapacityTons,
} from '~/constants/vehicles'

/**
 * The bug: a driver who picks «10 տոննայից ավելի» at registration gets
 * `capacityTons = 12` stored (`representativeCapacityTons`'s stand-in figure,
 * needed only so `matchesCapacityRange` has something strictly inside the
 * open-ended bucket to filter on) — and the truck's own profile/card then
 * printed that stand-in verbatim as "մինչև 12 տ", disagreeing with the exact
 * same range shown one click earlier in the registration form and the public
 * filter («10 տոննայից ավելի»). `capacityDisplayText` is the fix: it goes
 * through the same bucket lookup and, for the open bucket, shows the bucket's
 * own label instead of the internal stand-in number.
 */
describe('capacityDisplayText', () => {
  it('shows the open bucket label, not the internal stand-in figure', () => {
    const stored = representativeCapacityTons('over-10')
    expect(stored).toBe(12) // the stand-in — asserted so this test breaks if it ever changes
    expect(capacityDisplayText(stored)).toBe('10 տոննայից ավելի')
    expect(capacityDisplayText(stored)).not.toContain('12')
  })

  it('still says "մինչև X" for every bounded bucket', () => {
    for (const option of CAPACITY_RANGE_OPTIONS) {
      if (option.maxTons === undefined) continue // the open bucket, covered above
      const stored = representativeCapacityTons(option.value)
      expect(stored).toBe(option.maxTons) // bounded buckets store their real ceiling
      expect(capacityDisplayText(stored)).toBe(`մինչև ${stored} տ`)
    }
  })

  it('falls back to "մինչև X" for a figure matching no bucket', () => {
    // Defensive: any capacityTons already in the database that predates a
    // range change, or a bad manual edit, still gets a sane answer.
    expect(capacityDisplayText(-1)).toBe('մինչև -1 տ')
  })
})
