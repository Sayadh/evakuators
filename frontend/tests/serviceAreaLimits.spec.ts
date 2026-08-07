import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  countLimitedAreas,
  MAX_AREAS_ONE_REGION,
  MAX_AREAS_TWO_REGIONS,
  MAX_AREAS_WITH_YEREVAN,
  MAX_REGIONS,
  maxAreasFor,
  validateServiceAreaSelection,
} from '~/constants/serviceAreaLimits'
import {
  getRegionCities,
  getRegionServiceZones,
  getStaticDistricts,
  resolveAreaType,
} from '~/utils/geography'

/**
 * The frontend half of the coverage cap — what a driver is *offered*.
 *
 * Written against real slugs from the static geography rather than invented
 * ones, because the rule depends on `resolveAreaType` classifying them
 * correctly: a test using made-up slugs would pass while the picker miscounted
 * every real tick, since an unknown slug resolves to `City`.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Two real Yerevan district slugs */
const [firstDistrict, secondDistrict] = getStaticDistricts().map((district) => district.slug)
/** Real Kotayk city slugs */
const kotaykCities = getRegionCities('kotayk').map((city) => city.slug)
const loriCities = getRegionCities('lori').map((city) => city.slug)

describe('the budget', () => {
  it('is 3 for one marz, 5 for two, and 2 whenever Yerevan is in', () => {
    expect(maxAreasFor(['lori'])).toBe(MAX_AREAS_ONE_REGION)
    expect(maxAreasFor(['lori', 'armavir'])).toBe(MAX_AREAS_TWO_REGIONS)
    expect(maxAreasFor(['yerevan'])).toBe(MAX_AREAS_WITH_YEREVAN)
    expect(maxAreasFor(['yerevan', 'kotayk'])).toBe(MAX_AREAS_WITH_YEREVAN)
  })

  it('grows when a second marz is added, and shrinks when it is removed', () => {
    expect(maxAreasFor(['lori'])).toBe(3)
    expect(maxAreasFor(['lori', 'armavir'])).toBe(5)
    expect(maxAreasFor(['lori'])).toBe(3)
  })

  it('returns the one-marz budget before any marz is chosen', () => {
    // The counter reads "0 of 3" on an empty form rather than "0 of 5"
    // followed by a drop the moment the first marz is ticked.
    expect(maxAreasFor([])).toBe(MAX_AREAS_ONE_REGION)
  })

  it('restores the ordinary cap the moment Yerevan is removed', () => {
    // Rule 8: dropping Yerevan needs no other action.
    expect(maxAreasFor(['yerevan', 'kotayk'])).toBe(MAX_AREAS_WITH_YEREVAN)
    expect(maxAreasFor(['kotayk'])).toBe(MAX_AREAS_ONE_REGION)
  })

  it('still allows two regions', () => {
    // The cap is on places, not on regions — picking two marzes stays possible.
    expect(MAX_REGIONS).toBe(2)
  })
})

describe('counting', () => {
  it('never charges a Yerevan district', () => {
    const districtTypes = getStaticDistricts().map((district) => resolveAreaType(district.slug))
    expect(countLimitedAreas(districtTypes)).toBe(0)
  })

  it('charges a city one', () => {
    expect(countLimitedAreas([resolveAreaType(kotaykCities[0]!)])).toBe(1)
  })

  it('charges a road corridor one, exactly like a city', () => {
    // Rule 5: «Գառնի–Գեղարդ» is one answer to "where do you work", and is
    // deliberately not cheaper than a town.
    const zones = getRegionServiceZones('kotayk')
    if (zones.length === 0) return
    expect(countLimitedAreas([resolveAreaType(zones[0]!.slug)])).toBe(1)
  })
})

describe('validateServiceAreaSelection — the four product cases', () => {
  it('1. Yerevan alone: all twelve districts are fine', () => {
    const districts = getStaticDistricts().map((district) => district.slug)
    expect(validateServiceAreaSelection(['yerevan'], districts)).toBe('')
  })

  it('2. Yerevan plus a marz: two places outside Yerevan', () => {
    const base = [firstDistrict!, secondDistrict!]
    expect(
      validateServiceAreaSelection(['yerevan', 'kotayk'], [...base, ...kotaykCities.slice(0, 2)]),
    ).toBe('')
    expect(
      validateServiceAreaSelection(['yerevan', 'kotayk'], [...base, ...kotaykCities.slice(0, 3)]),
    ).not.toBe('')
  })

  it('3. one marz: three places', () => {
    expect(validateServiceAreaSelection(['lori'], loriCities.slice(0, 3))).toBe('')
    expect(validateServiceAreaSelection(['lori'], loriCities.slice(0, 4))).not.toBe('')
  })

  it('4. two marzes: five in total, not five each', () => {
    const mixed = [...loriCities.slice(0, 3), ...kotaykCities.slice(0, 2)]
    expect(validateServiceAreaSelection(['lori', 'kotayk'], mixed)).toBe('')
    expect(
      validateServiceAreaSelection(['lori', 'kotayk'], [...mixed, kotaykCities[2]!]),
    ).not.toBe('')
  })

  it('the same four places pass for two marzes and fail for one', () => {
    const four = loriCities.slice(0, 4)
    expect(validateServiceAreaSelection(['lori', 'kotayk'], four)).toBe('')
    expect(validateServiceAreaSelection(['lori'], four)).not.toBe('')
  })
})

describe('validateServiceAreaSelection — messages', () => {
  it('asks for at least one area before it talks about limits', () => {
    expect(validateServiceAreaSelection(['lori'], [])).toContain('առնվազն')
  })

  it('names the number the driver is allowed', () => {
    expect(validateServiceAreaSelection(['lori'], loriCities.slice(0, 4))).toContain(
      String(MAX_AREAS_ONE_REGION),
    )
    expect(
      validateServiceAreaSelection(['lori', 'kotayk'], [...loriCities.slice(0, 6)]),
    ).toContain(String(MAX_AREAS_TWO_REGIONS))
    expect(
      validateServiceAreaSelection(['yerevan', 'kotayk'], kotaykCities.slice(0, 3)),
    ).toContain(String(MAX_AREAS_WITH_YEREVAN))
  })
})

describe('the two copies of the rule', () => {
  /**
   * There is no shared code between the two projects (CLAUDE.md), so the
   * numbers exist twice and nothing catches a drift at compile time. This reads
   * the backend file as text — the same technique the repository-auth-header
   * test uses — so at least the constants cannot silently disagree.
   */
  const backend = readFileSync(`${ROOT}../backend/src/tow-trucks/service-area-limits.ts`, 'utf8')

  it('agree on both budgets and on the region cap', () => {
    expect(backend).toContain(`MAX_AREAS_ONE_REGION = ${MAX_AREAS_ONE_REGION}`)
    expect(backend).toContain(`MAX_AREAS_TWO_REGIONS = ${MAX_AREAS_TWO_REGIONS}`)
    expect(backend).toContain(`MAX_AREAS_WITH_YEREVAN = ${MAX_AREAS_WITH_YEREVAN}`)
    expect(backend).toContain(`MAX_REGIONS = ${MAX_REGIONS}`)
  })

  it('agree on how many districts Yerevan has', () => {
    // The backend uses this as the ceiling for the exempt half of the
    // registration bound; the frontend owns the actual list.
    expect(backend).toContain(`YEREVAN_DISTRICT_COUNT = ${getStaticDistricts().length}`)
  })
})
