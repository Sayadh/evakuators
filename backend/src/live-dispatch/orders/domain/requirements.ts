/**
 * Technical fit between an order and a tow truck.
 *
 * ## Unknown is never "fits"
 *
 * Every requirement on an order is three-valued: `true`, `false` or `null`
 * (not asked yet). Dispatch cannot start while any is `null` — or the weight
 * is unknown — UNLESS an operator recorded an explicit override with a note,
 * which is written to the audit trail. Silently treating "we did not ask" as
 * "no special need" is how a car with a locked gearbox gets a truck that
 * cannot load it.
 *
 * ## Business rules that need product sign-off (ASSUMPTIONS, flagged)
 *
 * The codebase has no field for "can load a car with locked steering/gearbox",
 * so the first version maps those to the equipment that exists:
 *
 * - wheels do not roll, steering locked or gearbox locked
 *   → `wheelSkates` OR a crane (`derivesManipulator`)
 * - `needsManipulator` → `derivesManipulator` (vehicle type OR the checkbox,
 *   the same union every other reader uses — docs/taxonomies.md)
 * - weight → `maxLoadTons` when stated (specialist trucks), else `capacityTons`
 *   (the band's representative value — docs/taxonomies.md)
 * - `heavy-duty` trucks are offered ordinary jobs only when the vehicle is
 *   heavier than HEAVY_VEHICLE_KG; `manipulator`-type trucks only when the job
 *   needs a crane. Same spirit as SPECIALIST_VEHICLE_TYPES on the public site.
 *
 * All of it lives in this one file so changing a rule is changing one place.
 */
import {
  derivesManipulator,
  HEAVY_DUTY_VEHICLE_TYPE,
  MANIPULATOR_VEHICLE_TYPE,
} from '../../../tow-trucks/vehicle-types'

export const HEAVY_VEHICLE_KG = 3500

export interface OrderRequirements {
  vehicleWeightKg: number | null
  wheelsRoll: boolean | null
  steeringLocked: boolean | null
  gearboxLocked: boolean | null
  needsManipulator: boolean | null
  /** An operator explicitly accepted the unknowns (audited) */
  overridden: boolean
}

export interface TruckCapabilities {
  vehicleType: string
  capacityTons: number
  maxLoadTons: number | null
  manipulator: boolean
  wheelSkates: boolean
}

export type UnconfirmedField = 'vehicleWeightKg' | 'wheelsRoll' | 'steeringLocked' | 'gearboxLocked' | 'needsManipulator'

export function unconfirmedRequirements(order: OrderRequirements): UnconfirmedField[] {
  if (order.overridden) return []
  const missing: UnconfirmedField[] = []
  if (order.vehicleWeightKg === null) missing.push('vehicleWeightKg')
  if (order.wheelsRoll === null) missing.push('wheelsRoll')
  if (order.steeringLocked === null) missing.push('steeringLocked')
  if (order.gearboxLocked === null) missing.push('gearboxLocked')
  if (order.needsManipulator === null) missing.push('needsManipulator')
  return missing
}

export function needsLockedWheelEquipment(order: OrderRequirements): boolean {
  return order.wheelsRoll === false || order.steeringLocked === true || order.gearboxLocked === true
}

export type CapabilityMismatch = 'CAPACITY' | 'MANIPULATOR' | 'LOCKED_WHEEL_EQUIPMENT' | 'SPECIALIST_TYPE'

export function capabilityMismatches(order: OrderRequirements, truck: TruckCapabilities): CapabilityMismatch[] {
  const mismatches: CapabilityMismatch[] = []
  const hasCrane = derivesManipulator(truck.vehicleType, truck.manipulator)

  if (order.vehicleWeightKg !== null) {
    const loadTons = truck.maxLoadTons ?? truck.capacityTons
    if (loadTons * 1000 < order.vehicleWeightKg) mismatches.push('CAPACITY')
  }
  if (order.needsManipulator === true && !hasCrane) mismatches.push('MANIPULATOR')
  if (needsLockedWheelEquipment(order) && !truck.wheelSkates && !hasCrane) {
    mismatches.push('LOCKED_WHEEL_EQUIPMENT')
  }
  if (truck.vehicleType === HEAVY_DUTY_VEHICLE_TYPE && !(order.vehicleWeightKg !== null && order.vehicleWeightKg > HEAVY_VEHICLE_KG)) {
    mismatches.push('SPECIALIST_TYPE')
  }
  if (truck.vehicleType === MANIPULATOR_VEHICLE_TYPE && order.needsManipulator !== true) {
    mismatches.push('SPECIALIST_TYPE')
  }
  return mismatches
}

/**
 * The same rules as SQL, for the candidate query and the in-transaction
 * re-check. Parameters: $W weight kg (int or NULL), $M needs crane (bool),
 * $L needs locked-wheel equipment (bool). `t` is the TowTruck alias.
 *
 * Kept next to the TypeScript twin on purpose; `test-live/requirements-parity`
 * runs both over the same matrix of trucks and orders.
 */
export function capabilitySqlPredicate(weightParam: string, craneParam: string, lockedParam: string): string {
  const hasCrane = `(t."manipulator" OR t."vehicleType" = '${MANIPULATOR_VEHICLE_TYPE}')`
  return `(
    (${weightParam}::int IS NULL OR COALESCE(t."maxLoadTons", t."capacityTons") * 1000 >= ${weightParam}::int)
    AND (NOT ${craneParam}::boolean OR ${hasCrane})
    AND (NOT ${lockedParam}::boolean OR t."wheelSkates" OR ${hasCrane})
    AND (t."vehicleType" <> '${HEAVY_DUTY_VEHICLE_TYPE}' OR (${weightParam}::int IS NOT NULL AND ${weightParam}::int > ${HEAVY_VEHICLE_KG}))
    AND (t."vehicleType" <> '${MANIPULATOR_VEHICLE_TYPE}' OR ${craneParam}::boolean)
  )`
}
