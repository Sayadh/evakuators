import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { ServiceAreaDto } from '../src/tow-trucks/dto/service-area.dto'
import {
  assertRegistrationAreasWithinLimit,
  assertServiceAreasWithinLimit,
  hasUncappedCoverage,
  MAX_REGIONS,
} from '../src/tow-trucks/service-area-limits'

/**
 * Who the coverage cap applies to, now that it does not apply to everyone.
 *
 * The rules in `service-area-limits.ts` are the enforcing copy — the frontend
 * greys out checkboxes, which is a hint; this is the boundary. So the cases
 * worth writing are the ones where getting it wrong is silent:
 *
 * - the exemption reaching a driver it was not meant for (a listing that claims
 *   the country and answers nowhere is exactly what the cap exists to prevent);
 * - the exemption NOT reaching the drivers it was written for (a specialist
 *   page that refuses the only coverage its drivers can honestly state);
 * - the "at least one place" rule surviving the move out of the DTO, where
 *   `@ArrayMinSize` used to hold it.
 */

const city = (slug: string): ServiceAreaDto => ({ slug, name: slug, type: 'city' })
const region = (slug: string): ServiceAreaDto => ({ slug, name: slug, type: 'region' })

const manyCities = (count: number): ServiceAreaDto[] =>
  Array.from({ length: count }, (_, index) => city(`city-${index}`))

const flatbed = { vehicleType: 'flatbed' }
const manipulatorType = { vehicleType: 'manipulator' }
const heavyDutyType = { vehicleType: 'heavy-duty' }

describe('hasUncappedCoverage', () => {
  it('covers both specialist vehicle types', () => {
    expect(hasUncappedCoverage(manipulatorType)).toBe(true)
    expect(hasUncappedCoverage(heavyDutyType)).toBe(true)
  })

  it('covers a flatbed that answered yes to either capability', () => {
    // The unions, not `isSpecialistVehicleType` — a flatbed with a crane
    // travels for the same booked jobs, and it keeps its city listings anyway
    // because general discovery excludes on the TYPE alone.
    expect(hasUncappedCoverage({ ...flatbed, manipulator: true })).toBe(true)
    expect(hasUncappedCoverage({ ...flatbed, heavyEquipment: true })).toBe(true)
  })

  it('does not cover an ordinary evacuator', () => {
    expect(hasUncappedCoverage(flatbed)).toBe(false)
    expect(hasUncappedCoverage({ vehicleType: 'sliding-platform' })).toBe(false)
    expect(
      hasUncappedCoverage({ ...flatbed, manipulator: false, heavyEquipment: false }),
    ).toBe(false)
  })
})

describe('assertServiceAreasWithinLimit', () => {
  it('still caps an ordinary evacuator', () => {
    expect(() => assertServiceAreasWithinLimit(manyCities(6), ['lori'], flatbed)).toThrow(
      BadRequestException,
    )
  })

  it('lifts the cap for a truck that travels to booked jobs', () => {
    expect(() =>
      assertServiceAreasWithinLimit(manyCities(20), ['lori'], manipulatorType),
    ).not.toThrow()
  })

  it('caps when the caller names no vehicle — the safe direction', () => {
    // The exemption is a widening, so "unknown vehicle" must degrade to
    // "capped". Degrading the other way would let an older or a future client
    // opt out of the rule by simply not mentioning the truck.
    expect(() => assertServiceAreasWithinLimit(manyCities(6), ['lori'])).toThrow(
      BadRequestException,
    )
  })

  it('accepts marz-wide areas from an exempt driver', () => {
    expect(() =>
      assertServiceAreasWithinLimit(
        [region('lori'), region('syunik'), region('tavush')],
        ['lori', 'syunik', 'tavush'],
        heavyDutyType,
      ),
    ).not.toThrow()
  })
})

describe('assertRegistrationAreasWithinLimit', () => {
  it('still caps an ordinary evacuator', () => {
    expect(() =>
      assertRegistrationAreasWithinLimit(['lori'], ['a', 'b', 'c', 'd'], flatbed),
    ).toThrow(BadRequestException)
  })

  it('rejects more marzes than the cap allows', () => {
    // This rule used to be `@ArrayMaxSize(2)` on the DTO. It moved here because
    // a per-property decorator cannot see `vehicleType`, and the assertion is
    // that the move did not quietly drop it.
    const tooMany = Array.from({ length: MAX_REGIONS + 1 }, (_, i) => `region-${i}`)
    expect(() => assertRegistrationAreasWithinLimit(tooMany, ['a'], flatbed)).toThrow(
      BadRequestException,
    )
  })

  it('rejects an empty city list from a capped driver', () => {
    // Likewise `@ArrayMinSize(1)`. A profile that names no place says nothing
    // about where the truck works.
    expect(() => assertRegistrationAreasWithinLimit(['lori'], [], flatbed)).toThrow(
      BadRequestException,
    )
  })

  it('accepts an empty city list once «Ամբողջ Հայաստան» is the answer', () => {
    expect(() =>
      assertRegistrationAreasWithinLimit([], [], {
        ...manipulatorType,
        servesAllArmenia: true,
      }),
    ).not.toThrow()
  })

  it('still wants a marz from an exempt driver who did not say "everywhere"', () => {
    expect(() => assertRegistrationAreasWithinLimit([], [], manipulatorType)).toThrow(
      BadRequestException,
    )
  })

  it('lets an exempt driver name as many marzes as they work in', () => {
    expect(() =>
      assertRegistrationAreasWithinLimit(
        ['lori', 'syunik', 'tavush', 'ararat'],
        [],
        manipulatorType,
      ),
    ).not.toThrow()
  })
})

describe('MANUAL SYNC POINT: hasUncappedCoverage', () => {
  it('is mirrored by the frontend copy that decides what the picker offers', () => {
    // Read as TEXT, the same way `specialistVehicleTypes.spec.ts` reads this
    // project from the other side: the two apps share no code, so nothing
    // catches a drift at compile time. This copy is the boundary; the frontend
    // one decides whether the driver is ever SHOWN the nationwide choice.
    //
    // A drift is silent and one-sided in the worst way: a picker that offers
    // «Ամբողջ Հայաստան» to someone the API then refuses produces a save that
    // fails with a message about a control the driver used correctly.
    const frontend = readFileSync(
      join(__dirname, '../../frontend/constants/serviceAreaLimits.ts'),
      'utf8',
    )

    expect(frontend).toContain('export function hasUncappedCoverage')
    // Both sides must be a UNION of the two capabilities, not an intersection
    // and not the vehicle type alone.
    expect(frontend).toMatch(/hasManipulator|manipulator/)
    expect(frontend).toContain('heavyEquipment')
    expect(frontend).toContain('HeavyDuty')
  })

  it('is mirrored by the frontend `region` service-area type', () => {
    // `ServiceAreaDto.type` and `LocationType` are matched literally in both
    // directions inside the stored JSON, so a mismatch returns nobody rather
    // than erroring. `region` is the newest member and the easiest to forget.
    const dto = readFileSync(
      join(__dirname, '../src/tow-trucks/dto/service-area.dto.ts'),
      'utf8',
    )
    const enums = readFileSync(join(__dirname, '../../frontend/types/enums.ts'), 'utf8')

    expect(dto).toContain("'region'")
    expect(enums).toContain("Region = 'region'")
  })
})
