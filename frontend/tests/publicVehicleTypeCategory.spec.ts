import { describe, expect, it } from 'vitest'
import { publicVehicleTypeCategory } from '~/constants/vehicles'
import { VehicleType } from '~/types/enums'

/**
 * `TowTrucksService.getSimilar`'s narrowing: what a manipulator's or a
 * heavy-duty truck's own profile page should recommend nearby.
 *
 * Before this, `getSimilar` never looked at vehicle type at all — a
 * manipulator's profile recommended plain flatbed evacuators as "similar
 * trucks nearby", which answers a different question than the one a visitor
 * on that profile is asking. Same bug, same fix, for «Ծանր տեխնիկա».
 */
describe('publicVehicleTypeCategory', () => {
  it('is Manipulator for the manipulator vehicle type', () => {
    expect(publicVehicleTypeCategory({ type: VehicleType.Manipulator, manipulator: false })).toBe(
      VehicleType.Manipulator,
    )
  })

  it('is Manipulator for an ordinary type with the equipment checkbox ticked', () => {
    // The union this whole feature is built around: «Մանիպուլյատոր» is
    // answered by EITHER the vehicle type or the equipment checkbox.
    expect(publicVehicleTypeCategory({ type: VehicleType.Flatbed, manipulator: true })).toBe(
      VehicleType.Manipulator,
    )
  })

  it('is HeavyDuty for the heavy-duty vehicle type', () => {
    expect(publicVehicleTypeCategory({ type: VehicleType.HeavyDuty, manipulator: false })).toBe(
      VehicleType.HeavyDuty,
    )
  })

  it('is undefined for an ordinary evacuator', () => {
    expect(
      publicVehicleTypeCategory({ type: VehicleType.Flatbed, manipulator: false }),
    ).toBeUndefined()
    expect(
      publicVehicleTypeCategory({ type: VehicleType.SlidingPlatform, manipulator: false }),
    ).toBeUndefined()
  })

  it('never reports HeavyDuty for a manipulator-flagged truck, even if the type is also heavy-duty', () => {
    // Not a real combination in practice (heavyEquipment and manipulator are
    // asked of disjoint vehicle types), but the union check runs first, so a
    // truck that somehow had both is treated as a manipulator — the more
    // specific claim of the two vehicle-typed questions.
    expect(publicVehicleTypeCategory({ type: VehicleType.HeavyDuty, manipulator: true })).toBe(
      VehicleType.Manipulator,
    )
  })
})
