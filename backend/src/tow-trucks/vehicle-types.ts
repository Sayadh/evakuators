/**
 * The two vehicle-type slugs the backend cares about structurally.
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

/**
 * The slug behind `/tsanr-tehnika`.
 *
 * MANUAL SYNC POINT: must equal `VehicleType.HeavyDuty` in
 * `frontend/types/enums.ts`, and the `vehicleType` of `HEAVY_DUTY_PAGE` in
 * `frontend/constants/vehicleTypePages.ts` is what sends it over the wire.
 * Nothing enforces it at compile time — the two apps share no code.
 */
export const HEAVY_DUTY_VEHICLE_TYPE = 'heavy-duty'

/**
 * Whether a truck can move heavy machinery, given its type and the admin's own
 * flag. Either answer is enough — the same union `derivesManipulator` applies
 * to «Մանիպուլյատոր», for the same reason: the vehicle type *is* the claim,
 * said in the words of the taxonomy instead of the words of the flag.
 *
 * ## Why this one is admin-set and `manipulator` is driver-set
 *
 * «Ունի մանիպուլյատոր» is a question about equipment bolted to the truck — the
 * driver is the only one who knows, and a wrong answer is visible in the photos.
 * "Can move heavy machinery" is a judgement about capacity, platform size and
 * experience that a driver has every incentive to answer yes to, and a wrong
 * answer is discovered by a stranded excavator when the truck arrives and
 * cannot lift it. So there is no registration field and no dashboard field for
 * it, only `PATCH /admin/tow-trucks/:id/heavy-equipment`.
 *
 * The `heavy-duty` half of the union is not a loophole in that: choosing that
 * vehicle type is choosing to appear on `/tsanr-tehnika` by name, and the
 * admin panel shows those trucks as ticked-and-locked rather than pretending
 * the flag is what decides.
 *
 * ## Applied on READ, not baked into the column
 *
 * `derivesManipulator` is applied on every write, so the column ends up
 * holding the union. This one is the opposite: `TowTruck.heavyEquipment`
 * stores only the admin's own decision, and this function is called by the
 * listing filter and the admin mapper each time they read.
 *
 * The difference matters because the two inputs have different owners. A
 * driver can change their vehicle type from their own dashboard at any time —
 * if the union were baked in at approval, a driver could register as
 * `heavy-duty`, then switch to `flatbed`, and stay on an admin-only page
 * forever. Deriving on read means the type's contribution lasts exactly as
 * long as the type does.
 */
export function derivesHeavyEquipment(vehicleType: string, heavyEquipment: boolean): boolean {
  return heavyEquipment || vehicleType === HEAVY_DUTY_VEHICLE_TYPE
}

/**
 * The vehicle types that are NOT part of general discovery.
 *
 * «Մանիպուլյատոր» and «Ծանր տեխնիկա» each have a landing page of their own
 * (`/manipulator`, `/tsanr-tehnika`), and that page is the only place they are
 * listed. They do not appear on a city, marz or Yerevan listing, in the
 * homepage's featured picks, in the per-area counters, or in the nearest-driver
 * search.
 *
 * ## Why
 *
 * Someone browsing «Աբովյան» or pressing "find the nearest evacuator" is
 * describing an ordinary car by the roadside. A truck whose whole purpose is
 * lifting an excavator is not a substitute for that: it is usually further
 * away, more expensive, and its driver does not want the call either. Listing
 * it there costs both sides a wasted phone call, which is the only currency
 * this platform has — there is no booking flow to absorb a bad match.
 *
 * ## Why the TYPE alone, and not `derivesManipulator`/`derivesHeavyEquipment`
 *
 * This deliberately does NOT use the two union predicates above, and the
 * difference is the whole design:
 *
 * - The unions answer "can this truck ALSO do the specialist job", and that is
 *   the right question for the landing pages — a flatbed carrying a crane
 *   belongs on `/manipulator`, which is why the page keeps its union.
 * - This answers "is the specialist job all this truck is FOR", and that is
 *   the right question for hiding one. A flatbed with a crane is a perfectly
 *   ordinary evacuator; excluding it from every city page because of the
 *   checkbox would delete real supply from the listings for no reason, and the
 *   admin-set `heavyEquipment` flag would silently do the same.
 *
 * So a truck can be on `/manipulator` AND on Աբովյան's page (a flatbed with a
 * crane), or on `/manipulator` only (`vehicleType = 'manipulator'`). What
 * cannot happen is a truck being hidden from general discovery by a boolean it
 * ticked to describe an extra capability.
 *
 * ## The one query that lifts the exclusion is one that names the type
 *
 * `?vehicleType=manipulator` still answers with the union. Hiding is what
 * *general* discovery does; an explicit request for the type is not general
 * discovery. See `TowTrucksRepository.buildWhere`.
 *
 * MANUAL SYNC POINT: mirrored by `SPECIALIST_VEHICLE_TYPES` in
 * `frontend/constants/vehicles.ts`, which is what mock mode filters on. The
 * backend copy is the real boundary; the frontend copy exists so the two
 * modes list the same drivers. `frontend/tests/specialistVehicleTypes.spec.ts`
 * reads this file as text so they cannot drift.
 */
export const SPECIALIST_VEHICLE_TYPES = [
  MANIPULATOR_VEHICLE_TYPE,
  HEAVY_DUTY_VEHICLE_TYPE,
] as const

/** Whether this type is landing-page-only — see SPECIALIST_VEHICLE_TYPES */
export function isSpecialistVehicleType(vehicleType: string): boolean {
  return (SPECIALIST_VEHICLE_TYPES as readonly string[]).includes(vehicleType)
}
