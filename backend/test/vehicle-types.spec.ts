import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import {
  derivesHeavyEquipment,
  derivesManipulator,
  HEAVY_DUTY_VEHICLE_TYPE,
  MANIPULATOR_VEHICLE_TYPE,
} from '../src/tow-trucks/vehicle-types'

/**
 * `manipulator` is derived on write, not trusted from the payload — the same
 * treatment `works24Hours` gets, and for the same reason: it is implied by
 * another field the driver already filled in.
 *
 * The forms tick and lock the checkbox when the manipulator vehicle type is
 * chosen, but a disabled input is a hint to a browser and nothing to anything
 * else that speaks HTTP. This is the boundary.
 */

describe('derivesManipulator', () => {
  it('is true when the checkbox says so, whatever the type', () => {
    // A flatbed that also carries a crane is a real vehicle, and once the type
    // is spent on «Հարթակով էվակուատոր» the checkbox is the only way to say it.
    expect(derivesManipulator('flatbed', true)).toBe(true)
  })

  it('is true when the type says so, whatever the checkbox', () => {
    // The case that used to be lost: picking «Մանիպուլյատորով էվակուատոր» is a
    // complete answer, and the driver who gave only it was invisible to the
    // filter built for them.
    expect(derivesManipulator(MANIPULATOR_VEHICLE_TYPE, false)).toBe(true)
  })

  it('is false only when neither says so', () => {
    expect(derivesManipulator('flatbed', false)).toBe(false)
    expect(derivesManipulator('sliding-platform', false)).toBe(false)
    expect(derivesManipulator('heavy-duty', false)).toBe(false)
  })

  it('does not accept a near-miss slug', () => {
    // Guards the manual sync point from the other direction: a renamed or
    // mistyped type must not quietly start counting.
    expect(derivesManipulator('manipulyator', false)).toBe(false)
    expect(derivesManipulator('Manipulator', false)).toBe(false)
    expect(derivesManipulator('', false)).toBe(false)
  })

  it('never turns a true into a false', () => {
    // The derivation only ever widens. A driver's own `true` is theirs to keep,
    // which is why the forms lock the box rather than clearing it when the type
    // changes away.
    for (const type of ['flatbed', 'sliding-platform', 'heavy-duty', MANIPULATOR_VEHICLE_TYPE]) {
      expect(derivesManipulator(type, true)).toBe(true)
    }
  })
})

describe('derivesHeavyEquipment', () => {
  /**
   * Same union shape as `derivesManipulator`, different source of truth: the
   * flag half is set by an ADMIN, never by the driver — there is no
   * registration field and no dashboard field for it. See the doc comment on
   * the function for why this one judgement is not the driver's to make.
   */
  it('is true when an admin says so, whatever the type', () => {
    // The case the flag exists for: a long-platform flatbed, or a manipulator
    // with a crane big enough for an excavator. Neither picked `heavy-duty`.
    expect(derivesHeavyEquipment('flatbed', true)).toBe(true)
    expect(derivesHeavyEquipment(MANIPULATOR_VEHICLE_TYPE, true)).toBe(true)
  })

  it('is true when the type says so, whatever the flag', () => {
    // Choosing «Ծանր տեխնիկայի էվակուատոր» is already the claim, which is why
    // the admin panel shows those trucks ticked AND disabled.
    expect(derivesHeavyEquipment(HEAVY_DUTY_VEHICLE_TYPE, false)).toBe(true)
  })

  it('is false only when neither says so', () => {
    expect(derivesHeavyEquipment('flatbed', false)).toBe(false)
    expect(derivesHeavyEquipment('sliding-platform', false)).toBe(false)
    expect(derivesHeavyEquipment(MANIPULATOR_VEHICLE_TYPE, false)).toBe(false)
  })

  it('does not accept a near-miss slug', () => {
    // Guards the manual sync point with `VehicleType.HeavyDuty`.
    expect(derivesHeavyEquipment('heavyduty', false)).toBe(false)
    expect(derivesHeavyEquipment('heavy_duty', false)).toBe(false)
    expect(derivesHeavyEquipment('Heavy-Duty', false)).toBe(false)
    expect(derivesHeavyEquipment('', false)).toBe(false)
  })

  it('is a different question from derivesManipulator', () => {
    // The two are structurally identical and sit next to each other, so a
    // copy-paste that crossed the constants would still compile and still
    // return booleans — and quietly swap the two landing pages' contents.
    expect(derivesHeavyEquipment(MANIPULATOR_VEHICLE_TYPE, false)).toBe(false)
    expect(derivesManipulator(HEAVY_DUTY_VEHICLE_TYPE, false)).toBe(false)
  })
})
