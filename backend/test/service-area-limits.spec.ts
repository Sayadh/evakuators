import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { ServiceAreaDto } from '../src/tow-trucks/dto/service-area.dto'
import {
  assertRegistrationAreasWithinLimit,
  assertServiceAreasWithinLimit,
  MAX_AREAS_ONE_REGION,
  MAX_AREAS_TWO_REGIONS,
  MAX_AREAS_WITH_YEREVAN,
  YEREVAN_DISTRICT_COUNT,
} from '../src/tow-trucks/service-area-limits'

/**
 * The coverage cap, enforced. The frontend greys out checkboxes; that is a hint.
 * These are the checks that decide what is actually stored, so they are written
 * against the payload shapes the two write paths really receive rather than
 * against the picker's idea of them.
 */

const city = (slug: string): ServiceAreaDto => ({ slug, name: slug, type: 'city' })
const district = (slug: string): ServiceAreaDto => ({ slug, name: slug, type: 'district' })
const route = (slug: string): ServiceAreaDto => ({ slug, name: slug, type: 'route' })

const cities = (count: number): ServiceAreaDto[] =>
  Array.from({ length: count }, (_, index) => city(`city-${index}`))

const allYerevanDistricts = (): ServiceAreaDto[] =>
  Array.from({ length: YEREVAN_DISTRICT_COUNT }, (_, index) => district(`district-${index}`))

const ONE_MARZ = ['lori']
const TWO_MARZES = ['lori', 'armavir']

describe('assertServiceAreasWithinLimit — the four product cases', () => {
  it('1. Yerevan alone: every district, no cap', () => {
    expect(() => assertServiceAreasWithinLimit(allYerevanDistricts(), ['yerevan'])).not.toThrow()
  })

  it('2. Yerevan plus a marz: two places outside Yerevan', () => {
    const regions = ['yerevan', 'kotayk']
    const selection = [...allYerevanDistricts(), city('abovyan'), city('hrazdan')]
    expect(() => assertServiceAreasWithinLimit(selection, regions)).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit([...selection, city('charentsavan')], regions),
    ).toThrow(BadRequestException)
  })

  it('3. one marz, no Yerevan: three places', () => {
    expect(() => assertServiceAreasWithinLimit(cities(3), ONE_MARZ)).not.toThrow()
    expect(() => assertServiceAreasWithinLimit(cities(4), ONE_MARZ)).toThrow(BadRequestException)
  })

  it('4. two marzes, no Yerevan: five in TOTAL, not five each', () => {
    expect(() => assertServiceAreasWithinLimit(cities(5), TWO_MARZES)).not.toThrow()
    expect(() => assertServiceAreasWithinLimit(cities(6), TWO_MARZES)).toThrow(BadRequestException)
  })

  it('the second marz raises the budget rather than doubling it', () => {
    // Four places are too many for one marz and comfortably inside two — the
    // number that distinguishes the two cases, and the reason the region list
    // has to reach this function at all.
    expect(() => assertServiceAreasWithinLimit(cities(4), ONE_MARZ)).toThrow(BadRequestException)
    expect(() => assertServiceAreasWithinLimit(cities(4), TWO_MARZES)).not.toThrow()
  })
})

describe('assertServiceAreasWithinLimit — road corridors', () => {
  it('5. a corridor costs exactly one, the same as a city', () => {
    expect(() =>
      assertServiceAreasWithinLimit(
        [route('garni-geghard'), route('tatev-halidzor'), city('a')],
        ONE_MARZ,
      ),
    ).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit(
        [route('garni-geghard'), route('tatev-halidzor'), city('a'), city('b')],
        ONE_MARZ,
      ),
    ).toThrow(BadRequestException)
  })

  it('corridors are charged against the tighter budget when Yerevan is in', () => {
    const regions = ['yerevan', 'kotayk']
    expect(() =>
      assertServiceAreasWithinLimit(
        [district('kentron'), route('garni-geghard'), city('abovyan')],
        regions,
      ),
    ).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit(
        [district('kentron'), route('garni-geghard'), city('abovyan'), city('hrazdan')],
        regions,
      ),
    ).toThrow(BadRequestException)
  })
})

describe('assertServiceAreasWithinLimit — without a region list', () => {
  /**
   * The parameter is optional, and the fallback direction is the point: an
   * older client, or a future caller that forgets to pass it, must degrade to
   * "too permissive" rather than to "rejects valid selections". Five is the
   * loosest legitimate budget, so it is still a correct bound.
   */
  it('falls back to the two-marz budget, never rejecting a valid selection', () => {
    expect(() => assertServiceAreasWithinLimit(cities(5))).not.toThrow()
    expect(() => assertServiceAreasWithinLimit(cities(6))).toThrow(BadRequestException)
  })

  it('still applies the exact Yerevan rule, which needs no region list', () => {
    // Yerevan is readable from the payload itself — only Yerevan has districts —
    // so this case never depended on the caller passing anything.
    expect(() => assertServiceAreasWithinLimit([district('kentron'), ...cities(2)])).not.toThrow()
    expect(() => assertServiceAreasWithinLimit([district('kentron'), ...cities(3)])).toThrow(
      BadRequestException,
    )
  })
})

describe('assertServiceAreasWithinLimit — edges', () => {
  it('accepts an empty list, which the DTO rejects separately', () => {
    // Not this function's job: ArrayMinSize already refuses an empty coverage
    // list, and duplicating the rule would mean two messages for one mistake.
    expect(() => assertServiceAreasWithinLimit([], ONE_MARZ)).not.toThrow()
  })

  it('says how many are allowed, not just that there are too many', () => {
    // The driver's next action is to untick something specific, so the number
    // is the useful half of the message.
    expect(() => assertServiceAreasWithinLimit(cities(4), ONE_MARZ)).toThrow(
      new RegExp(String(MAX_AREAS_ONE_REGION)),
    )
    expect(() => assertServiceAreasWithinLimit(cities(6), TWO_MARZES)).toThrow(
      new RegExp(String(MAX_AREAS_TWO_REGIONS)),
    )
    expect(() =>
      assertServiceAreasWithinLimit([district('kentron'), ...cities(3)], ['yerevan', 'kotayk']),
    ).toThrow(new RegExp(String(MAX_AREAS_WITH_YEREVAN)))
  })
})

describe('assertRegistrationAreasWithinLimit — the untyped payload', () => {
  /**
   * Registration is the one endpoint that receives the region list outright, so
   * the non-Yerevan half of the rule is exact here with no inference at all.
   * Only the Yerevan half is a bound, because nothing in a flat slug list says
   * which entries are districts.
   */
  it('applies the exact three-for-one-marz rule', () => {
    expect(() => assertRegistrationAreasWithinLimit(['lori'], ['a', 'b', 'c'])).not.toThrow()
    expect(() => assertRegistrationAreasWithinLimit(['lori'], ['a', 'b', 'c', 'd'])).toThrow(
      BadRequestException,
    )
  })

  it('applies the exact five-for-two-marzes rule', () => {
    expect(() =>
      assertRegistrationAreasWithinLimit(['lori', 'armavir'], ['a', 'b', 'c', 'd', 'e']),
    ).not.toThrow()
    expect(() =>
      assertRegistrationAreasWithinLimit(['lori', 'armavir'], ['a', 'b', 'c', 'd', 'e', 'f']),
    ).toThrow(BadRequestException)
  })

  it('allows all twelve districts when Yerevan is the only region', () => {
    const districts = Array.from({ length: 12 }, (_, index) => `d${index}`)
    expect(() => assertRegistrationAreasWithinLimit(['yerevan'], districts)).not.toThrow()
    expect(() => assertRegistrationAreasWithinLimit(['yerevan'], [...districts, 'd12'])).toThrow(
      BadRequestException,
    )
  })

  it('allows twelve districts plus two places for Yerevan and a marz', () => {
    const districts = Array.from({ length: 12 }, (_, index) => `d${index}`)
    expect(() =>
      assertRegistrationAreasWithinLimit(['yerevan', 'kotayk'], [...districts, 'abovyan', 'hrazdan']),
    ).not.toThrow()

    expect(() =>
      assertRegistrationAreasWithinLimit(
        ['yerevan', 'kotayk'],
        [...districts, 'abovyan', 'hrazdan', 'charentsavan'],
      ),
    ).toThrow(BadRequestException)
  })

  it('is a bound only where Yerevan is involved — and that gap closes at approval', () => {
    // Fourteen marz cities claimed as "Yerevan + Kotayk" passes here, because
    // nothing in this payload says which are districts. It does not become a
    // listing: the admin's approve call sends the same areas back typed, with
    // the same region list, and the exact rule rejects them.
    const fourteenCities = Array.from({ length: 14 }, (_, index) => `city-${index}`)
    expect(() =>
      assertRegistrationAreasWithinLimit(['yerevan', 'kotayk'], fourteenCities),
    ).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit(
        fourteenCities.map((slug) => city(slug)),
        ['yerevan', 'kotayk'],
      ),
    ).toThrow(BadRequestException)
  })
})
