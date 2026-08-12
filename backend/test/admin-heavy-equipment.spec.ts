import 'reflect-metadata'
import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { AdminService } from '../src/admin/admin.service'
import { toAdminTowTruckSummary } from '../src/admin/admin-tow-truck.mapper'
import {
  derivesHeavyEquipment,
  HEAVY_DUTY_VEHICLE_TYPE,
} from '../src/tow-trucks/vehicle-types'

/**
 * The admin-only «Կարող է տեղափոխել ծանր տեխնիկա» flag — what puts a truck on
 * `/tsanr-tehnika` alongside the ones whose vehicle type already says so.
 *
 * The property worth pinning is that a `heavy-duty` truck cannot be turned
 * off. The admin panel disables that checkbox, but a disabled input is a hint
 * to a browser and nothing at all to anything else that speaks HTTP — the same
 * argument `derivesManipulator` is applied on every write for. If this were
 * ever trusted from the payload, an admin (or a stray request) could store
 * `false` on a truck the listing filter goes on returning anyway, leaving a row
 * whose two columns contradict each other and a panel that shows the opposite
 * of what the public page does.
 */

/**
 * An AdminService with only the one collaborator this path touches — hand
 * rolled rather than a Nest testing module, like admin-reset-password.spec.ts.
 * The tow-truck repository is the THIRD constructor argument.
 */
function buildService(truck: { id: number; vehicleType: string; heavyEquipment: boolean } | null) {
  const setHeavyEquipment = vi.fn((id: number, heavyEquipment: boolean) =>
    Promise.resolve({ id, heavyEquipment }),
  )
  const repository = {
    findById: vi.fn(() => Promise.resolve(truck ? { ...truck } : null)),
    setHeavyEquipment,
  }

  const service = new AdminService(
    {} as never,
    {} as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
  )

  return { service, setHeavyEquipment }
}

describe('setTowTruckHeavyEquipment', () => {
  it('turns the flag on for an ordinary truck', async () => {
    const { service, setHeavyEquipment } = buildService({
      id: 1,
      vehicleType: 'flatbed',
      heavyEquipment: false,
    })

    await expect(service.setTowTruckHeavyEquipment(1, true)).resolves.toEqual({
      id: 1,
      heavyEquipment: true,
    })
    expect(setHeavyEquipment).toHaveBeenCalledWith(1, true)
  })

  it('turns it off again for an ordinary truck', async () => {
    const { service, setHeavyEquipment } = buildService({
      id: 1,
      vehicleType: 'flatbed',
      heavyEquipment: true,
    })

    await expect(service.setTowTruckHeavyEquipment(1, false)).resolves.toEqual({
      id: 1,
      heavyEquipment: false,
    })
    expect(setHeavyEquipment).toHaveBeenCalledWith(1, false)
  })

  it('refuses to turn it off for a heavy-duty truck', async () => {
    // The lock, enforced server-side rather than only in the panel.
    const { service, setHeavyEquipment } = buildService({
      id: 2,
      vehicleType: HEAVY_DUTY_VEHICLE_TYPE,
      heavyEquipment: false,
    })

    await expect(service.setTowTruckHeavyEquipment(2, false)).resolves.toEqual({
      id: 2,
      heavyEquipment: true,
    })
    expect(setHeavyEquipment).not.toHaveBeenCalled()
  })

  it('never writes the derived true into the column', async () => {
    /**
     * The self-promotion hole this closes, in full:
     *
     *   1. driver registers as «Ծանր տեխնիկայի էվակուատոր» (`heavy-duty`)
     *   2. an admin opens the panel, which shows the box ticked and disabled
     *   3. if that tick were ever persisted, the driver could then change
     *      their vehicle type to `flatbed` from their OWN dashboard — which
     *      they are allowed to do — and stay on /tsanr-tehnika forever
     *
     * Step 3 is only impossible while the column holds the admin's decision
     * alone and the type's contribution is re-derived on every read. So the
     * assertion is not "the value is right" but "nothing was written".
     */
    const { service, setHeavyEquipment } = buildService({
      id: 3,
      vehicleType: HEAVY_DUTY_VEHICLE_TYPE,
      heavyEquipment: false,
    })

    // Asked either way, the answer is the same and the row is untouched.
    await expect(service.setTowTruckHeavyEquipment(3, true)).resolves.toEqual({
      id: 3,
      heavyEquipment: true,
    })
    await expect(service.setTowTruckHeavyEquipment(3, false)).resolves.toEqual({
      id: 3,
      heavyEquipment: true,
    })
    expect(setHeavyEquipment).not.toHaveBeenCalled()
  })

  it('drops a truck off the page when the driver changes type away from heavy-duty', () => {
    // The other half of the same story, at the read side: with nothing stored,
    // the union stops being true the moment the type does. A driver who
    // switches to `flatbed` is simply no longer on /tsanr-tehnika — unless an
    // admin had separately ticked the box, which is the point.
    expect(derivesHeavyEquipment(HEAVY_DUTY_VEHICLE_TYPE, false)).toBe(true)
    expect(derivesHeavyEquipment('flatbed', false)).toBe(false)
    expect(derivesHeavyEquipment('flatbed', true)).toBe(true)
  })

  it('writes nothing when the value is already what was asked for', async () => {
    // `updatedAt` feeds the sitemap's <lastmod>; a no-op request must not make
    // the sitemap claim the profile changed today.
    const { service, setHeavyEquipment } = buildService({
      id: 4,
      vehicleType: 'flatbed',
      heavyEquipment: true,
    })

    await service.setTowTruckHeavyEquipment(4, true)
    expect(setHeavyEquipment).not.toHaveBeenCalled()
  })

  it('404s for a truck that does not exist', async () => {
    const { service } = buildService(null)
    await expect(service.setTowTruckHeavyEquipment(99, true)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('the admin summary reports the derived value', () => {
  const base = {
    id: 1,
    slug: 'a',
    driverName: 'A',
    companyName: null,
    phone: '+37400000000',
    isActive: true,
    isFeatured: false,
    vehicleBrand: 'MAN',
    vehicleModel: null,
    vehicleYear: 2015,
    locationName: 'Երևան',
    latitude: null,
    longitude: null,
    locationUpdatedAt: null,
    serviceAreas: [],
    citySlug: null,
    districtSlug: null,
    regionSlug: null,
    telegramChatId: null,
    passwordHash: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    images: [],
  }

  it('ticks the box for a heavy-duty truck, whose column always says false', () => {
    // This is the NORMAL state for such a truck now, not an anomaly: nothing
    // ever writes the derived value. Without the read-side derivation the
    // panel would render an unticked box next to a truck /tsanr-tehnika is
    // already listing, which reads as a bug in the panel.
    const summary = toAdminTowTruckSummary({
      ...base,
      vehicleType: HEAVY_DUTY_VEHICLE_TYPE,
      heavyEquipment: false,
    } as never)

    expect(summary.heavyEquipment).toBe(true)
    // And carries the raw type, which is what tells the panel to DISABLE it
    // rather than merely showing it ticked.
    expect(summary.vehicleType).toBe(HEAVY_DUTY_VEHICLE_TYPE)
  })

  it('passes an ordinary truck through unchanged', () => {
    expect(
      toAdminTowTruckSummary({ ...base, vehicleType: 'flatbed', heavyEquipment: true } as never)
        .heavyEquipment,
    ).toBe(true)
    expect(
      toAdminTowTruckSummary({ ...base, vehicleType: 'flatbed', heavyEquipment: false } as never)
        .heavyEquipment,
    ).toBe(false)
  })
})
