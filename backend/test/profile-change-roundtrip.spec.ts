import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { MyTowTruckService } from '../src/my-tow-truck/my-tow-truck.service'
import type { UpdateMyTowTruckDto } from '../src/my-tow-truck/dto/update-my-tow-truck.dto'
import { diffProfile } from '../src/profile-changes/profile-change-diff'
import { currentProfileSnapshot } from '../src/profile-changes/profile-snapshot'

/**
 * The round trip: what a driver submits → what is stored as a diff → what an
 * approval writes.
 *
 * ## Why this test exists as its own file
 *
 * Every other test in this feature checks one hop. `profile-change-diff.spec.ts`
 * proves the diff keeps the right keys; `profile-changes.service.spec.ts` proves
 * approval calls the right method with them. Both pass while the feature is
 * broken, because the bug lives in the **join**: the diff drops a field the
 * apply step requires, and neither half can see that on its own.
 *
 * That is not hypothetical — it is exactly what happened. The dashboard sends
 * `serviceAreas` together with `citySlug`/`districtSlug`/`regionSlug`, because
 * `applyUpdate` refuses a coverage change that does not say where the truck is
 * based. A driver adding one city while keeping the same base changes only
 * `serviceAreas`, so the diff dropped the placement as "unchanged" — and every
 * such edit became permanently unapprovable, with an error message about a
 * field the driver had in fact sent.
 *
 * So this runs the real diff against the real apply, with only the database
 * mocked, and asserts on the Prisma update input that comes out the far end.
 */

/** A live profile, in the shape `TowTrucksRepository.findById` returns */
const LIVE = {
  id: 7,
  driverName: 'Աշոտ Աշոտյան',
  companyName: null,
  secondaryPhone: null,
  whatsapp: null,
  telegram: null,
  email: null,
  vehicleBrand: 'Isuzu',
  vehicleModel: null,
  vehicleYear: 2018,
  vehicleType: 'flatbed',
  capacityTons: 3,
  platformLengthM: null,
  platformWidthM: null,
  winch: true,
  manipulator: false,
  wheelSkates: false,
  works24Hours: false,
  description: 'Հին նկարագրություն, բավական երկար է որ վավեր լինի։',
  services: ['towing'],
  workingHoursText: null,
  locationName: 'Աբովյան',
  serviceAreas: [{ slug: 'abovyan', name: 'Աբովյան', type: 'city' }],
  regionSlug: 'kotayk',
  citySlug: 'abovyan',
  districtSlug: null,
  priceCityCallout: null,
  pricePerKm: null,
  priceWaitingPerHour: null,
  priceNightSurchargePercent: null,
  priceExtraLoading: null,
  latitude: null,
  longitude: null,
  isActive: true,
  isFeatured: false,
  heavyEquipment: false,
  slug: 'ashot',
  phone: '+37491000001',
  // The profile mapper stamps these onto its response; they are not part of
  // anything under test, they just have to exist.
  locationUpdatedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  images: [{ id: 1 }, { id: 2 }],
}

/**
 * Exactly what `pages/dashboard.vue` builds: the whole form, every time.
 *
 * Reproduced here rather than imported, because the frontend is a separate
 * project (CLAUDE.md) — this is the wire contract, and a test that shares code
 * with one side of a contract is not testing the contract.
 */
function dashboardPayload(overrides: Partial<UpdateMyTowTruckDto> = {}): UpdateMyTowTruckDto {
  return {
    driverName: LIVE.driverName,
    companyName: '',
    secondaryPhone: '',
    whatsapp: '',
    telegram: '',
    email: '',
    vehicleBrand: LIVE.vehicleBrand,
    vehicleModel: '',
    vehicleYear: LIVE.vehicleYear,
    vehicleType: LIVE.vehicleType,
    capacityTons: LIVE.capacityTons,
    winch: LIVE.winch,
    manipulator: LIVE.manipulator,
    wheelSkates: LIVE.wheelSkates,
    description: LIVE.description,
    services: [...LIVE.services],
    locationName: LIVE.locationName,
    serviceAreas: LIVE.serviceAreas as never,
    // The dashboard always sends all four together — see its `buildPayload`.
    regionSlugs: ['kotayk'],
    regionSlug: LIVE.regionSlug,
    citySlug: LIVE.citySlug,
    imageIds: [1, 2],
    ...overrides,
  } as UpdateMyTowTruckDto
}

/** Runs diff → apply and hands back the Prisma update input that reached the DB */
async function roundTrip(submitted: UpdateMyTowTruckDto): Promise<Record<string, unknown>> {
  const diff = diffProfile(
    submitted as unknown as Record<string, unknown>,
    currentProfileSnapshot(LIVE as never),
  )

  const updateOwnProfile = vi.fn((id: number, data: Record<string, unknown>) =>
    Promise.resolve({ ...LIVE, ...data, images: LIVE.images }),
  )

  const service = new MyTowTruckService(
    { findById: vi.fn(() => Promise.resolve(LIVE)), updateOwnProfile } as never,
    {
      findByTowTruckId: vi.fn(() => Promise.resolve(LIVE.images)),
      findUnattachedByIds: vi.fn((ids: number[]) => Promise.resolve(ids.map((id) => ({ id })))),
      detachFromTowTruck: vi.fn(() => Promise.resolve()),
      applyGallery: vi.fn(() => Promise.resolve()),
    } as never,
  )

  // `latitude`/`longitude` are applied through the coordinate path, exactly as
  // ProfileChangesService.approve() splits them.
  const { latitude: _lat, longitude: _lng, ...profileChanges } = diff.changes

  await service.applyUpdate(7, profileChanges as UpdateMyTowTruckDto)

  return updateOwnProfile.mock.calls[0]?.[1] ?? {}
}

describe('a coverage change survives the round trip', () => {
  const withExtraCity = dashboardPayload({
    serviceAreas: [
      { slug: 'abovyan', name: 'Աբովյան', type: 'city' },
      { slug: 'hrazdan', name: 'Հրազդան', type: 'city' },
    ] as never,
  })

  it('is approvable at all', async () => {
    // The regression. `applyUpdate` refuses a coverage change that does not say
    // where the truck is based, and the driver's base did not move — so a diff
    // that kept only what differed left the placement out and made this edit
    // permanently unapprovable.
    await expect(roundTrip(withExtraCity)).resolves.toBeDefined()
  })

  it('keeps the base the driver did not move', async () => {
    // Not merely present: correct. `applyUpdate` writes
    // `citySlug: rest.citySlug ?? null` whenever serviceAreas is part of the
    // update, so a placement field that goes missing is not left alone — it is
    // actively nulled, and the truck falls off its own city page.
    const data = await roundTrip(withExtraCity)

    expect(data.citySlug).toBe('abovyan')
    expect(data.regionSlug).toBe('kotayk')
    expect(data.districtSlug).toBeNull()
  })

  it('stores the new coverage list', async () => {
    const data = await roundTrip(withExtraCity)

    expect(data.serviceAreas).toEqual([
      { slug: 'abovyan', name: 'Աբովյան', type: 'city' },
      { slug: 'hrazdan', name: 'Հրազդան', type: 'city' },
    ])
  })

  it('still moves the base when the driver DID move it', async () => {
    const data = await roundTrip(
      dashboardPayload({
        serviceAreas: [{ slug: 'hrazdan', name: 'Հրազդան', type: 'city' }] as never,
        citySlug: 'hrazdan',
        regionSlug: 'kotayk',
      }),
    )

    expect(data.citySlug).toBe('hrazdan')
  })
})

describe('the rest of the round trip', () => {
  it('writes only the columns the driver actually changed', async () => {
    // The other half of the same property. A diff that carried the whole form
    // would rewrite thirty columns to values they already held, silently
    // clobbering anything an admin had changed while the edit waited.
    const data = await roundTrip(dashboardPayload({ driverName: 'Աշոտ Ուղղված' }))

    expect(Object.keys(data)).toEqual(['driverName'])
    expect(data.driverName).toBe('Աշոտ Ուղղված')
  })

  it('derives works24Hours when the services change', async () => {
    const data = await roundTrip(
      dashboardPayload({ services: ['towing', 'available-24-7'] }),
    )

    expect(data.works24Hours).toBe(true)
  })

  it('derives manipulator against the STORED half this diff does not mention', async () => {
    // The diff carries only `vehicleType`; the checkbox is unchanged and absent.
    // `applyUpdate` resolves the pair against the live row, which is why the
    // apply step reads the profile again instead of trusting the diff alone.
    const data = await roundTrip(dashboardPayload({ vehicleType: 'manipulator' }))

    expect(data.manipulator).toBe(true)
  })

  it('clears a contact field the driver emptied, and only that one', async () => {
    const withWhatsapp = { ...LIVE, whatsapp: '+37491000001' }
    const diff = diffProfile(
      dashboardPayload() as unknown as Record<string, unknown>,
      currentProfileSnapshot(withWhatsapp as never),
    )

    // '' against a stored value is a real change; '' against null is not, which
    // is what keeps every other empty box out of the diff.
    expect(diff.changes).toEqual({ whatsapp: '', regionSlugs: ['kotayk'] })
  })

  it('produces nothing at all from an untouched form', async () => {
    const diff = diffProfile(
      dashboardPayload() as unknown as Record<string, unknown>,
      currentProfileSnapshot(LIVE as never),
    )

    expect(diff.changes).toEqual({})
  })
})
