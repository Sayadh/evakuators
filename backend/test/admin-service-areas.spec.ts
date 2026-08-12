import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'
import { RemoveServiceAreaDto } from '../src/admin/dto/remove-service-area.dto'
import type { ServiceAreaJson } from '../src/tow-trucks/tow-truck.types'

/**
 * `PATCH /admin/tow-trucks/:id/service-areas` — removing one served area from
 * an approved driver.
 *
 * The interesting properties are not "does it delete the entry" but the three
 * things around it: that the endpoint can only ever *shrink* coverage, that the
 * structural placement cannot be left pointing at an area the truck no longer
 * serves, and that the coverage cap is NOT applied — which looks like a missing
 * check until you notice it would make legacy over-limit drivers the only ones
 * an admin cannot trim. That last one is asserted here so nobody "fixes" it.
 */

type Truck = {
  id: number
  serviceAreas: ServiceAreaJson[]
  citySlug: string | null
  districtSlug: string | null
  regionSlug: string | null
}

const KOTAYK_TRUCK: Truck = {
  id: 7,
  serviceAreas: [
    { slug: 'abovyan', name: 'Աբովյան', type: 'city' },
    { slug: 'hrazdan', name: 'Հրազդան', type: 'city' },
    { slug: 'garni-geghard', name: 'Գառնի–Գեղարդ', type: 'route' },
  ],
  citySlug: 'abovyan',
  districtSlug: null,
  regionSlug: 'kotayk',
}

/**
 * Builds an AdminService with only the two repository methods this path uses.
 *
 * Hand-rolled rather than a Nest testing module on purpose — the suite never
 * touches a real database (docs/testing.md), and the constructor's other six
 * dependencies are irrelevant to a JSON edit. `setServiceAreas` echoes what it
 * was given, which is also what makes the "read back from the row" assertion
 * below meaningful.
 */
function buildService(truck: Truck | null = KOTAYK_TRUCK) {
  const setServiceAreas = vi.fn(
    (
      id: number,
      serviceAreas: ServiceAreaJson[],
      placement: { citySlug: string | null; districtSlug: string | null; regionSlug: string | null },
    ) => Promise.resolve({ id, serviceAreas, ...placement }),
  )

  const repository = {
    findById: vi.fn(() => Promise.resolve(truck ? structuredClone(truck) : null)),
    setServiceAreas,
  }

  const service = new AdminService(
    {} as never,
    {} as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
  )

  return { service, repository, setServiceAreas }
}

function dto(fields: Partial<RemoveServiceAreaDto> & { slug: string }): RemoveServiceAreaDto {
  const instance = new RemoveServiceAreaDto()
  Object.assign(instance, fields)
  return instance
}

describe('removing an area', () => {
  it('drops exactly the named slug and keeps the rest, in order', async () => {
    const { service, setServiceAreas } = buildService()

    const result = await service.removeTowTruckServiceArea(7, dto({ slug: 'hrazdan' }))

    expect(result.serviceAreas.map((area) => area.slug)).toEqual(['abovyan', 'garni-geghard'])
    expect(setServiceAreas).toHaveBeenCalledOnce()
  })

  it('writes back plain objects carrying exactly slug/name/type', async () => {
    // The column is JSONB and an old row may hold keys nothing documents. Every
    // rewrite narrows it back to the shape ServiceAreaJson describes.
    const { service, setServiceAreas } = buildService({
      ...KOTAYK_TRUCK,
      serviceAreas: [
        { slug: 'abovyan', name: 'Աբովյան', type: 'city', legacy: true },
        { slug: 'hrazdan', name: 'Հրազդան', type: 'city' },
      ] as unknown as ServiceAreaJson[],
    })

    await service.removeTowTruckServiceArea(7, dto({ slug: 'hrazdan' }))

    expect(setServiceAreas.mock.calls[0]![1]).toEqual([
      { slug: 'abovyan', name: 'Աբովյան', type: 'city' },
    ])
  })

  it('404s for a truck that does not exist', async () => {
    const { service } = buildService(null)
    await expect(service.removeTowTruckServiceArea(7, dto({ slug: 'abovyan' }))).rejects.toThrow(
      NotFoundException,
    )
  })

  it('rejects a slug the truck does not serve, and says it may be stale', async () => {
    // A panel left open while someone else removed the same area is the usual
    // cause, so the message points at a refresh rather than at a missing truck.
    const { service, setServiceAreas } = buildService()

    await expect(service.removeTowTruckServiceArea(7, dto({ slug: 'gyumri' }))).rejects.toThrow(
      /թարմացրեք էջը/,
    )
    expect(setServiceAreas).not.toHaveBeenCalled()
  })

  it('refuses to remove the last area, and points at deactivation instead', async () => {
    // An empty list matches no city, district or marz filter, so the driver
    // would vanish from every browsing page while still reading "Ակտիվ" in the
    // panel — a deactivation nobody performed and nothing displays.
    const { service, setServiceAreas } = buildService({
      ...KOTAYK_TRUCK,
      serviceAreas: [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }],
    })

    await expect(service.removeTowTruckServiceArea(7, dto({ slug: 'abovyan' }))).rejects.toThrow(
      /Ապաակտիվացնել/,
    )
    expect(setServiceAreas).not.toHaveBeenCalled()
  })
})

describe('the structural placement', () => {
  it('is left alone when the removed area is not the placement', async () => {
    const { service, setServiceAreas } = buildService()

    await service.removeTowTruckServiceArea(7, dto({ slug: 'hrazdan' }))

    expect(setServiceAreas.mock.calls[0]![2]).toEqual({
      citySlug: 'abovyan',
      districtSlug: null,
      regionSlug: 'kotayk',
    })
  })

  it('ignores a placement sent when the placement did not change', async () => {
    // Relocating a truck is approve()'s job and the dashboard's. If a removal
    // could carry one, the delete button would be a second, undocumented way to
    // move a driver between cities.
    const { service, setServiceAreas } = buildService()

    await service.removeTowTruckServiceArea(
      7,
      dto({ slug: 'hrazdan', citySlug: 'garni-geghard', regionSlug: 'lori' }),
    )

    expect(setServiceAreas.mock.calls[0]![2]).toEqual({
      citySlug: 'abovyan',
      districtSlug: null,
      regionSlug: 'kotayk',
    })
  })

  it('re-points to the replacement when the placement itself is removed', async () => {
    const { service, setServiceAreas } = buildService()

    await service.removeTowTruckServiceArea(
      7,
      dto({ slug: 'abovyan', citySlug: 'hrazdan', regionSlug: 'kotayk' }),
    )

    expect(setServiceAreas.mock.calls[0]![2]).toEqual({
      citySlug: 'hrazdan',
      districtSlug: null,
      regionSlug: 'kotayk',
    })
  })

  it('rejects a replacement that is not among the surviving areas', async () => {
    // The one check that needs no geography and catches the mistake that
    // matters: a truck filed under a city it does not serve.
    const { service, setServiceAreas } = buildService()

    await expect(
      service.removeTowTruckServiceArea(7, dto({ slug: 'abovyan', citySlug: 'gyumri' })),
    ).rejects.toThrow(BadRequestException)
    expect(setServiceAreas).not.toHaveBeenCalled()
  })

  it('rejects a replacement that is the very area being removed', async () => {
    // Falls out of the same rule, and is worth pinning: this is the exact
    // request a naive client sends when it forgets to recompute.
    const { service } = buildService()

    await expect(
      service.removeTowTruckServiceArea(7, dto({ slug: 'abovyan', citySlug: 'abovyan' })),
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects a city and a district together', async () => {
    const { service } = buildService()

    await expect(
      service.removeTowTruckServiceArea(
        7,
        dto({ slug: 'abovyan', citySlug: 'hrazdan', districtSlug: 'kentron' }),
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('clears the marz when the replacement is a Yerevan district', async () => {
    // Yerevan is a pseudo-region with no regionSlug. Keeping the old value would
    // leave a truck that moved into Yerevan still listed on the marz it left.
    const { service, setServiceAreas } = buildService({
      id: 7,
      serviceAreas: [
        { slug: 'abovyan', name: 'Աբովյան', type: 'city' },
        { slug: 'kentron', name: 'Կենտրոն', type: 'district' },
      ],
      citySlug: 'abovyan',
      districtSlug: null,
      regionSlug: 'kotayk',
    })

    await service.removeTowTruckServiceArea(
      7,
      dto({ slug: 'abovyan', districtSlug: 'kentron', regionSlug: 'kotayk' }),
    )

    expect(setServiceAreas.mock.calls[0]![2]).toEqual({
      citySlug: null,
      districtSlug: 'kentron',
      regionSlug: null,
    })
  })

  it('empties the placement when nothing left can be one', async () => {
    // Corridor-only coverage. Both columns are nullable for exactly this case
    // and `findPlaceSlug` on the frontend already returns undefined for it, so
    // refusing here would only stop an admin finishing a cleanup the data model
    // permits.
    const { service, setServiceAreas } = buildService({
      id: 7,
      serviceAreas: [
        { slug: 'abovyan', name: 'Աբովյան', type: 'city' },
        { slug: 'garni-geghard', name: 'Գառնի–Գեղարդ', type: 'route' },
      ],
      citySlug: 'abovyan',
      districtSlug: null,
      regionSlug: 'kotayk',
    })

    await service.removeTowTruckServiceArea(7, dto({ slug: 'abovyan' }))

    expect(setServiceAreas.mock.calls[0]![2]).toEqual({
      citySlug: null,
      districtSlug: null,
      regionSlug: null,
    })
  })
})

describe('the coverage cap is deliberately not applied', () => {
  /**
   * Drivers approved before the cap existed keep their oversized lists — that
   * was the explicit decision (do not touch stored data, ask for a trim on the
   * next save). Running `assertServiceAreasWithinLimit` here would throw on the
   * *result* of the first removal, since 9 areas is still over the limit, and
   * the drivers an admin most needs to trim would be the only ones who could
   * not be trimmed. Shrinking is safe by construction; no check is needed.
   */
  it('lets an admin trim a legacy truck that is far over the limit', async () => {
    const oversized: ServiceAreaJson[] = Array.from({ length: 10 }, (_, index) => ({
      slug: `city-${index}`,
      name: `Քաղաք ${index}`,
      type: 'city',
    }))

    const { service, setServiceAreas } = buildService({
      id: 7,
      serviceAreas: oversized,
      citySlug: 'city-0',
      districtSlug: null,
      regionSlug: 'kotayk',
    })

    const result = await service.removeTowTruckServiceArea(7, dto({ slug: 'city-9' }))

    expect(result.serviceAreas).toHaveLength(9)
    expect(setServiceAreas).toHaveBeenCalledOnce()
  })

  it('cannot grow a list, whatever the request says', async () => {
    // The structural argument for why no cap is needed: the endpoint names one
    // slug to drop and never accepts a list, so every possible call produces
    // strictly fewer areas than were stored.
    const { service, setServiceAreas } = buildService()

    await service.removeTowTruckServiceArea(
      7,
      // Extra keys a caller might hope are read as "and add these"
      dto({ slug: 'hrazdan', citySlug: 'gyumri' } as never),
    ).catch(() => undefined)

    const written = setServiceAreas.mock.calls[0]?.[1] ?? []
    expect(written.length).toBeLessThan(KOTAYK_TRUCK.serviceAreas.length)
  })
})
