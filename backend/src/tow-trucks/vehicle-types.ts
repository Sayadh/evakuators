/**
 * The one vehicle-type slug the backend cares about structurally.
 *
 * Everything else in the taxonomy — labels, descriptions, the order of the
 * select — lives entirely in the frontend (`frontend/constants/vehicles.ts`),
 * and the backend stores `vehicleType` as an opaque string. This is the same
 * arrangement as `AVAILABLE_24_7_SLUG` in `service-slugs.ts`, and it exists for
 * the same reason: one field is derived from another, and the derivation has to
 * happen where the write happens.
 *
 * ## Why `manipulator` is derived rather than trusted
 *
 * The registration form asks the same question twice: «Մանիպուլյատորով
 * էվակուատոր» as a vehicle type, and «Ունի մանիպուլյատոր» as an equipment
 * checkbox. Both are legitimate answers on their own — the second is the honest
 * one for a flatbed that also carries a crane — but the first *implies* the
 * second, and a driver who gave only the first was invisible to the
 * «Մանիպուլյատոր» filter: exactly the customer looking for them never saw them.
 *
 * The forms now tick and lock the checkbox when that type is chosen. That is a
 * hint, not a boundary — a disabled input is a suggestion to anything that
 * speaks HTTP — so the rule is applied again here, on every write, exactly as
 * `works24Hours` is.
 *
 * The frontend still holds the union in `hasManipulator()` and must keep doing
 * so: rows written before this existed have the inconsistent pair, and nothing
 * migrated them.
 *
 * MANUAL SYNC POINT: must equal `VehicleType.Manipulator` in
 * `frontend/types/enums.ts`. Nothing enforces it at compile time — the two
 * apps share no code — so renaming one means renaming both.
 */
export const MANIPULATOR_VEHICLE_TYPE = 'manipulator'

/**
 * Whether a truck has a manipulator, given its type and the driver's own
 * checkbox. Either answer is enough; see above for why.
 *
 * Takes the two values rather than a truck so it can be used on a
 * `RegistrationRequest` (at approval) and on an update DTO (on a dashboard
 * save) without either shape having to look like the other.
 */
export function derivesManipulator(vehicleType: string, manipulator: boolean): boolean {
  return manipulator || vehicleType === MANIPULATOR_VEHICLE_TYPE
}
