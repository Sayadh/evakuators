import { describe, expect, it } from 'vitest'
import { towTruckLocationParams } from '~/utils/adminTowTruckLocation'

/**
 * The admin tow-trucks list's marz/settlement filter, in isolation from the
 * page — see the function's own comment for why this is worth pinning on its
 * own: three branches, and an easy way to get one wrong.
 */

describe('towTruckLocationParams', () => {
  it('sends nothing when no marz is chosen — "no filter", not "match nothing"', () => {
    expect(towTruckLocationParams('', '')).toEqual({})
    // A leftover settlement with no marz is not a state the filter selects can
    // reach (the region watcher clears it), but the function must not invent
    // a filter out of it if it somehow arrives anyway.
    expect(towTruckLocationParams('', 'abovyan')).toEqual({})
  })

  it('filters by regionSlug alone when a marz is chosen but no settlement', () => {
    expect(towTruckLocationParams('kotayk', '')).toEqual({ regionSlug: 'kotayk' })
  })

  it('narrows to one town with regionSlug + citySlug together, never citySlug alone', () => {
    expect(towTruckLocationParams('kotayk', 'abovyan')).toEqual({
      regionSlug: 'kotayk',
      citySlug: 'abovyan',
    })
  })

  it('sends yerevan:true for "all of Yerevan" — there is no regionSlug to match', () => {
    expect(towTruckLocationParams('yerevan', '')).toEqual({ yerevan: true })
  })

  it('sends districtSlug for one Yerevan district, not citySlug and not yerevan', () => {
    expect(towTruckLocationParams('yerevan', 'kentron')).toEqual({ districtSlug: 'kentron' })
  })
})
