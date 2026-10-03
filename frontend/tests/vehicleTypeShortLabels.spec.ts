import { describe, expect, it } from 'vitest'
import {
  VEHICLE_TYPE_LABELS,
  VEHICLE_TYPE_SHORT_LABELS,
  vehicleTypeLabel,
  vehicleTypeShortLabel,
} from '~/constants/vehicles'
import { VehicleType } from '~/types/enums'

/**
 * The short names exist for one screen — the dispatcher's candidate cards,
 * where every row is already an evacuator and the word is four repetitions of
 * a fact the page has established.
 *
 * The risk they introduce is drift: two sets of Armenian names for the same
 * four things, which quietly become two different taxonomies. The prefix
 * assertion is what makes that impossible to do by accident — a short label
 * may TRIM its long one, never say something else.
 */
describe('VEHICLE_TYPE_SHORT_LABELS', () => {
  it('covers every type the taxonomy has', () => {
    for (const type of Object.values(VehicleType)) {
      expect(VEHICLE_TYPE_SHORT_LABELS[type], type).toBeTruthy()
    }
  })

  it('is a trim of the full label, never a different name for it', () => {
    for (const type of Object.values(VehicleType)) {
      expect(VEHICLE_TYPE_LABELS[type].startsWith(VEHICLE_TYPE_SHORT_LABELS[type]), type).toBe(true)
    }
  })

  it('is actually shorter — otherwise it has no reason to exist', () => {
    for (const type of Object.values(VehicleType)) {
      expect(
        VEHICLE_TYPE_SHORT_LABELS[type].length,
        type,
      ).toBeLessThan(VEHICLE_TYPE_LABELS[type].length)
    }
  })
})

describe('the slug lookups', () => {
  it('reads a known slug as its name', () => {
    expect(vehicleTypeLabel(VehicleType.Manipulator)).toBe('Մանիպուլյատորով էվակուատոր')
    expect(vehicleTypeShortLabel(VehicleType.Manipulator)).toBe('Մանիպուլյատորով')
  })

  it('hands back an unknown slug rather than `undefined`', () => {
    // `TowTruck.vehicleType` is a free-text column holding a taxonomy slug: a
    // row written before a type existed, or after one is renamed, still has to
    // render as something a human can read.
    expect(vehicleTypeLabel('tractor')).toBe('tractor')
    expect(vehicleTypeShortLabel('tractor')).toBe('tractor')
  })
})
