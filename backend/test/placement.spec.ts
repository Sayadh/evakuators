import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'
import { SetPrimaryAreaDto } from '../src/admin/dto/set-primary-area.dto'
import { assertPlacementIsServed } from '../src/tow-trucks/placement'
import type { ServiceAreaJson } from '../src/tow-trucks/tow-truck.types'

/**
 * A tow truck's **base** — the one place it works out of.
 *
 * This stopped being cosmetic when city pages began ranking locally-based
 * drivers above everyone else: a truck filed under a town it does not serve now
 * appears FIRST on that town's page while being the one driver who never agreed
 * to go there. `assertPlacementIsServed` is the rule that prevents it, and all
 * three write paths share it.
 */

const AREAS: ServiceAreaJson[] = [
  { slug: 'abovyan', name: 'Աբովյան', type: 'city' },
  { slug: 'kentron', name: 'Կենտրոն', type: 'district' },
  { slug: 'garni-geghard', name: 'Գառնի–Գեղարդ', type: 'route' },
]

describe('assertPlacementIsServed', () => {
  it('accepts a served city and a served district', () => {
    expect(() => assertPlacementIsServed(AREAS, { citySlug: 'abovyan' })).not.toThrow()
    expect(() => assertPlacementIsServed(AREAS, { districtSlug: 'kentron' })).not.toThrow()
  })

  it('rejects a place the truck does not serve', () => {
    expect(() => assertPlacementIsServed(AREAS, { citySlug: 'gyumri' })).toThrow(
      BadRequestException,
    )
  })

  it('rejects a road corridor', () => {
    // Nobody is "based in" «Գառնի–Գեղարդ», and a corridor slug in citySlug
    // would file the driver under a city page that does not exist.
    expect(() => assertPlacementIsServed(AREAS, { citySlug: 'garni-geghard' })).toThrow(
      /ուղղություն է/,
    )
  })

  it('rejects a district sent as a city, and a city sent as a district', () => {
    // Cities and Yerevan districts are matched by different columns, so a
    // crossed pair means the row is simply never found by either page.
    expect(() => assertPlacementIsServed(AREAS, { citySlug: 'kentron' })).toThrow(
      /Երևանի շրջան է/,
    )
    expect(() => assertPlacementIsServed(AREAS, { districtSlug: 'abovyan' })).toThrow(
      /քաղաք է/,
    )
  })

  it('rejects both halves at once', () => {
    expect(() =>
      assertPlacementIsServed(AREAS, { citySlug: 'abovyan', districtSlug: 'kentron' }),
    ).toThrow(BadRequestException)
  })

  it('accepts an empty placement — corridor-only coverage has none', () => {
    // Callers that require one enforce that themselves; both columns are
    // nullable precisely for this case.
    expect(() => assertPlacementIsServed(AREAS, {})).not.toThrow()
    expect(() => assertPlacementIsServed(AREAS, { citySlug: null })).not.toThrow()
  })
})

function buildService(areas: ServiceAreaJson[] = AREAS) {
  const setPrimaryArea = vi.fn(
    (id: number, data: Record<string, unknown>) => Promise.resolve({ id, ...data }),
  )
  const repository = {
    findById: vi.fn(() =>
      Promise.resolve({
        id: 7,
        serviceAreas: areas,
        citySlug: 'abovyan',
        districtSlug: null,
        regionSlug: 'kotayk',
        locationName: 'Աբովյան',
      }),
    ),
    setPrimaryArea,
  }

  const service = new AdminService(
    {} as never,
    {} as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
  )

  return { service, setPrimaryArea }
}

function dto(fields: Partial<SetPrimaryAreaDto>): SetPrimaryAreaDto {
  const instance = new SetPrimaryAreaDto()
  Object.assign(instance, { locationName: 'Աբովյան', ...fields })
  return instance
}

describe('setTowTruckPrimaryArea', () => {
  it('stores the chosen city with its marz', async () => {
    const { service, setPrimaryArea } = buildService()

    await service.setTowTruckPrimaryArea(
      7,
      dto({ citySlug: 'abovyan', regionSlug: 'kotayk', locationName: 'Աբովյան' }),
    )

    expect(setPrimaryArea.mock.calls[0]![1]).toEqual({
      citySlug: 'abovyan',
      districtSlug: null,
      regionSlug: 'kotayk',
      locationName: 'Աբովյան',
    })
  })

  it('nulls the marz for a Yerevan district, even when one is sent', async () => {
    // Yerevan is a pseudo-region. Keeping the old marz would leave a truck that
    // moved into Yerevan listed on the marz page it left.
    const { service, setPrimaryArea } = buildService()

    await service.setTowTruckPrimaryArea(
      7,
      dto({ districtSlug: 'kentron', regionSlug: 'kotayk', locationName: 'Կենտրոն' }),
    )

    expect(setPrimaryArea.mock.calls[0]![1]).toMatchObject({
      citySlug: null,
      districtSlug: 'kentron',
      regionSlug: null,
    })
  })

  it('stores the composed label verbatim', async () => {
    // The backend has no geography and cannot rebuild «Վարդենիս, գյուղ Շատվան»
    // from a slug, so whatever the panel composed is what is shown forever.
    const { service, setPrimaryArea } = buildService()

    await service.setTowTruckPrimaryArea(
      7,
      dto({ citySlug: 'abovyan', locationName: '  Աբովյան, գյուղ Զովք  ' }),
    )

    expect(setPrimaryArea.mock.calls[0]![1]).toMatchObject({
      locationName: 'Աբովյան, գյուղ Զովք',
    })
  })

  it('refuses an empty choice', async () => {
    // Unlike the removal path, where an empty placement is a real outcome, an
    // admin here has opened a picker whose whole purpose is to choose one.
    const { service, setPrimaryArea } = buildService()

    await expect(service.setTowTruckPrimaryArea(7, dto({}))).rejects.toThrow(BadRequestException)
    expect(setPrimaryArea).not.toHaveBeenCalled()
  })

  it("refuses a place outside the truck's coverage", async () => {
    const { service, setPrimaryArea } = buildService()

    await expect(service.setTowTruckPrimaryArea(7, dto({ citySlug: 'gyumri' }))).rejects.toThrow(
      BadRequestException,
    )
    expect(setPrimaryArea).not.toHaveBeenCalled()
  })

  it('refuses a road corridor', async () => {
    const { service } = buildService()

    await expect(
      service.setTowTruckPrimaryArea(7, dto({ citySlug: 'garni-geghard' })),
    ).rejects.toThrow(/ուղղություն է/)
  })
})

describe('coordinates at approval', () => {
  /**
   * The pair an approval writes is the one the moderator submitted, full stop —
   * the review page shows them the box (pre-filled when the driver answered),
   * so there is nothing left for the backend to fall back to.
   *
   * That is deliberately narrower than the old behaviour, which read the stored
   * request whenever both keys were absent. It had to: while approval was a
   * yes/no on a record, "absent" could not be distinguished from "the moderator
   * never saw it". Now it can, and absent means the box was empty.
   *
   * Reached through the private resolver rather than through `approve()`: the
   * surrounding method opens a transaction, writes images and calls Telegram,
   * none of which says anything about which coordinate pair wins.
   */
  const resolve = (dtoFields: {
    latitude?: number
    longitude?: number
  }): { latitude: unknown; longitude: unknown } => {
    const { service } = buildService()
    return (
      service as unknown as {
        resolveApprovalCoordinates: (d: unknown) => { latitude: unknown; longitude: unknown }
      }
    ).resolveApprovalCoordinates(dtoFields)
  }

  it('writes no location when the box was left empty', () => {
    // `locationUpdatedAt` is derived from this being null, so a stray default
    // here would stamp a timestamp on a location nobody ever set.
    expect(resolve({})).toEqual({ latitude: null, longitude: null })
  })

  it('does NOT reach back to the stored request when both keys are absent', () => {
    // The guard for the behaviour change above. The resolver takes one argument
    // now; if a future edit reintroduced a `request` fallback, an empty body
    // would silently start publishing a pair the moderator was looking at an
    // empty box for.
    expect(
      (
        service_resolveArity() as { length: number }
      ).length,
    ).toBe(1)
  })

  it('writes the pair the moderator submitted', () => {
    expect(resolve({ latitude: 40.2, longitude: 44.5 })).toEqual({
      latitude: 40.2,
      longitude: 44.5,
    })
  })

  it('rejects half a pair', () => {
    // Half a coordinate is neither "has a location" nor "has none" downstream.
    expect(() => resolve({ latitude: 40.2 })).toThrow(BadRequestException)
    expect(() => resolve({ longitude: 44.5 })).toThrow(BadRequestException)
  })

  it('rejects a point outside Armenia, admin or not', () => {
    // A transposed pair from an admin lands a truck in the Indian Ocean just as
    // readily as one from a driver.
    expect(() => resolve({ latitude: 44.4991, longitude: 40.1792 })).toThrow(BadRequestException)
  })

  function service_resolveArity(): unknown {
    const { service } = buildService()
    return (service as unknown as Record<string, unknown>).resolveApprovalCoordinates
  }
})
