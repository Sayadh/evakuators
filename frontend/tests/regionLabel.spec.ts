import { describe, expect, it } from 'vitest'
import { getStaticRegions, regionLabel, YEREVAN_REGION_SLUG } from '~/utils/geography'
import { buildServiceAreas } from '~/utils/serviceAreas'
import { primaryRegionOptions } from '~/utils/primaryArea'
import { LocationType } from '~/types/enums'

/**
 * Yerevan is not one of the 10 marzes in `staticRegions` — it is a
 * pseudo-region (see CLAUDE.md § geography) — so `findStaticRegion('yerevan')`
 * returns `undefined`. Three call sites independently wrote
 * `findStaticRegion(slug)?.name ?? slug` and got three different answers for
 * this one slug: two special-cased it, one didn't. The one that didn't
 * (`buildServiceAreas`) is what put the literal string "yerevan" on a live
 * profile's «Սպասարկվող տարածքներ» chips for any manipulator/heavy-duty
 * driver who chose Yerevan as one of their uncapped marzes.
 */
describe('regionLabel', () => {
  it('resolves Yerevan to its Armenian name, not the raw slug', () => {
    expect(regionLabel(YEREVAN_REGION_SLUG)).toBe('Երևան')
  })

  it('resolves every real marz to its static name', () => {
    for (const region of getStaticRegions()) {
      expect(regionLabel(region.slug)).toBe(region.name)
    }
  })

  it('falls back to the raw slug only for something that is neither', () => {
    expect(regionLabel('not-a-real-slug')).toBe('not-a-real-slug')
  })
})

describe('buildServiceAreas — uncapped coverage including Yerevan', () => {
  it('names a Yerevan region entry «Երևան», not "yerevan"', () => {
    const areas = buildServiceAreas({
      vehicleType: 'manipulator',
      manipulator: true,
      regionSlugs: [YEREVAN_REGION_SLUG, 'kotayk'],
      citySlugs: [],
    })

    const yerevanArea = areas.find((area) => area.slug === YEREVAN_REGION_SLUG)
    expect(yerevanArea).toEqual({
      slug: YEREVAN_REGION_SLUG,
      name: 'Երևան',
      type: LocationType.Region,
    })
  })
})

describe('primaryRegionOptions', () => {
  it('labels a Yerevan-district candidate as «Երևան»', () => {
    const options = primaryRegionOptions([
      { slug: 'kentron', type: LocationType.District },
    ])
    expect(options).toContainEqual({ value: YEREVAN_REGION_SLUG, label: 'Երևան' })
  })
})
