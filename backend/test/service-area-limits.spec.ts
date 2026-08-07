import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { ServiceAreaDto } from '../src/tow-trucks/dto/service-area.dto'
import {
  assertRegistrationAreasWithinLimit,
  assertServiceAreasWithinLimit,
  MAX_AREAS_WITH_YEREVAN,
  MAX_AREAS_WITHOUT_YEREVAN,
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

describe('assertServiceAreasWithinLimit — the four product cases', () => {
  it('1. Yerevan alone: every district, no cap', () => {
    expect(() => assertServiceAreasWithinLimit(allYerevanDistricts())).not.toThrow()
  })

  it('2. Yerevan plus a marz: two places outside Yerevan', () => {
    const selection = [...allYerevanDistricts(), city('abovyan'), city('hrazdan')]
    expect(() => assertServiceAreasWithinLimit(selection)).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit([...selection, city('charentsavan')]),
    ).toThrow(BadRequestException)
  })

  it('3. one marz, no Yerevan: five places', () => {
    expect(() => assertServiceAreasWithinLimit(cities(5))).not.toThrow()
    expect(() => assertServiceAreasWithinLimit(cities(6))).toThrow(BadRequestException)
  })

  it('4. two marzes, no Yerevan: five in TOTAL, not five each', () => {
    // The payload carries no region, which is the point — the budget is spent
    // across the whole selection, so the backend does not need to know which
    // marz a city belongs to in order to enforce it.
    const acrossTwoMarzes = [
      city('vanadzor'),
      city('alaverdi'),
      city('stepanavan'),
      city('armavir'),
      city('vagharshapat'),
    ]
    expect(() => assertServiceAreasWithinLimit(acrossTwoMarzes)).not.toThrow()
    expect(() => assertServiceAreasWithinLimit([...acrossTwoMarzes, city('metsamor')])).toThrow(
      BadRequestException,
    )
  })
})

describe('assertServiceAreasWithinLimit — road corridors', () => {
  it('5. a corridor costs exactly one, the same as a city', () => {
    expect(() =>
      assertServiceAreasWithinLimit([
        route('garni-geghard'),
        route('tatev-halidzor'),
        city('a'),
        city('b'),
        city('c'),
      ]),
    ).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit([
        route('garni-geghard'),
        route('tatev-halidzor'),
        route('third'),
        city('a'),
        city('b'),
        city('c'),
      ]),
    ).toThrow(BadRequestException)
  })

  it('corridors are charged against the tighter budget when Yerevan is in', () => {
    expect(() =>
      assertServiceAreasWithinLimit([district('kentron'), route('garni-geghard'), city('abovyan')]),
    ).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit([
        district('kentron'),
        route('garni-geghard'),
        city('abovyan'),
        city('hrazdan'),
      ]),
    ).toThrow(BadRequestException)
  })
})

describe('assertServiceAreasWithinLimit — edges', () => {
  it('accepts an empty list, which the DTO rejects separately', () => {
    // Not this function's job: ArrayMinSize already refuses an empty coverage
    // list, and duplicating the rule would mean two messages for one mistake.
    expect(() => assertServiceAreasWithinLimit([])).not.toThrow()
  })

  it('says how many are allowed, not just that there are too many', () => {
    // The driver's next action is to untick something specific, so the number
    // is the useful half of the message.
    expect(() => assertServiceAreasWithinLimit(cities(6))).toThrow(
      new RegExp(String(MAX_AREAS_WITHOUT_YEREVAN)),
    )
    expect(() =>
      assertServiceAreasWithinLimit([district('kentron'), ...cities(3)]),
    ).toThrow(new RegExp(String(MAX_AREAS_WITH_YEREVAN)))
  })

  it('a single district is enough to switch to the tighter budget', () => {
    // "Yerevan is selected" is read off the payload's own types — one district
    // means Yerevan, because nowhere else in the country has districts.
    expect(() => assertServiceAreasWithinLimit([district('kentron'), ...cities(2)])).not.toThrow()
    expect(() => assertServiceAreasWithinLimit([district('kentron'), ...cities(3)])).toThrow(
      BadRequestException,
    )
  })
})

describe('assertRegistrationAreasWithinLimit — the untyped payload', () => {
  /**
   * Registration sends flat slugs, so the exact rule is not applicable here.
   * What is asserted is that the bound is right: it never rejects a selection
   * an honest client could make, and never accepts one it could not.
   */
  it('rejects more than five when Yerevan is not among the regions', () => {
    expect(() => assertRegistrationAreasWithinLimit(['lori'], ['a', 'b', 'c', 'd', 'e'])).not.toThrow()
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

  it('is a bound, not the exact rule — and the gap is closed at approval', () => {
    // Fourteen marz cities claimed as "Yerevan + Kotayk" passes here, because
    // nothing in this payload says which are districts. It does not become a
    // listing: the admin's approve call sends the same areas back typed, and
    // assertServiceAreasWithinLimit rejects them.
    const fourteenCities = Array.from({ length: 14 }, (_, index) => `city-${index}`)
    expect(() =>
      assertRegistrationAreasWithinLimit(['yerevan', 'kotayk'], fourteenCities),
    ).not.toThrow()

    expect(() =>
      assertServiceAreasWithinLimit(fourteenCities.map((slug) => city(slug))),
    ).toThrow(BadRequestException)
  })
})
