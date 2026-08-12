import { VehicleType } from '~/types/enums'
import type { SelectOption } from '~/types/common'

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  [VehicleType.Flatbed]: 'Հարթակով էվակուատոր',
  [VehicleType.SlidingPlatform]: 'Սահող հարթակով էվակուատոր',
  [VehicleType.Manipulator]: 'Մանիպուլյատորով էվակուատոր',
  [VehicleType.HeavyDuty]: 'Ծանր տեխնիկայի էվակուատոր',
}

export const VEHICLE_TYPE_DESCRIPTIONS: Record<VehicleType, string> = {
  [VehicleType.Flatbed]: 'Սովորական մարդատար մեքենաների տեղափոխման համար',
  [VehicleType.SlidingPlatform]:
    'Հարթակը դուրս է սահում, հարմար է ցածր և վթարված մեքենաների համար',
  [VehicleType.Manipulator]:
    'Ունի կռունկ՝ դժվար հասանելի վայրերից մեքենա բարձրացնելու համար',
  [VehicleType.HeavyDuty]: 'Բեռնատարների, ավտոբուսների և ծանր տեխնիկայի համար',
}

export interface CapacityRangeOption extends SelectOption {
  /** Exclusive lower bound in tons — undefined means no lower bound */
  minTons?: number
  /** Inclusive upper bound in tons — undefined means no upper bound */
  maxTons?: number
}

/**
 * Single source of truth for capacity ranges — used identically by the
 * registration form ("Առավելագույն բեռնատարողություն"), the driver
 * dashboard, and the public listing filter ("Բեռնատարողություն"). Change a
 * range here and every picker/filter updates together, see
 * utils/towTruckFilters.ts's matchesCapacityRange() for how a truck's exact
 * capacityTons gets matched against the range the customer picked.
 */
export const CAPACITY_RANGE_OPTIONS: CapacityRangeOption[] = [
  { value: 'up-to-2', label: 'Մինչև 2 տոննա', maxTons: 2 },
  { value: '2-3.5', label: '2–3.5 տոննա', minTons: 2, maxTons: 3.5 },
  { value: '3.5-5', label: '3.5–5 տոննա', minTons: 3.5, maxTons: 5 },
  { value: '5-10', label: '5–10 տոննա', minTons: 5, maxTons: 10 },
  { value: 'over-10', label: '10 տոննայից ավելի', minTons: 10 },
]

/** Which range bucket a truck's exact capacity falls into (min exclusive, max inclusive) */
export function matchesCapacityRange(capacityTons: number, rangeValue: string): boolean {
  const option = CAPACITY_RANGE_OPTIONS.find((item) => item.value === rangeValue)
  if (!option) return true
  if (option.minTons !== undefined && capacityTons <= option.minTons) return false
  if (option.maxTons !== undefined && capacityTons > option.maxTons) return false
  return true
}

/**
 * At registration the driver only picks a range (e.g. "3.5–5 տոննա"), not an
 * exact figure — but TowTruck.capacityTons is a precise Float used for
 * filtering (see matchesCapacityRange above). On approval we derive a
 * representative exact value from the chosen range automatically, so the
 * admin never has to re-enter a number the driver already gave.
 */
export function representativeCapacityTons(rangeValue: string): number {
  const option = CAPACITY_RANGE_OPTIONS.find((item) => item.value === rangeValue)
  if (!option) return 1
  if (option.maxTons !== undefined) return option.maxTons
  if (option.minTons !== undefined) return option.minTons + 2
  return 1
}

export const VEHICLE_TYPE_OPTIONS: SelectOption<VehicleType>[] = Object.entries(
  VEHICLE_TYPE_LABELS,
).map(([value, label]) => ({ value: value as VehicleType, label }))

/**
 * Does this truck have a manipulator (crane)?
 *
 * ## Why this is a function and not just `vehicle.manipulator`
 *
 * The registration form asks the same question twice, in two shapes that are
 * both legitimate on their own:
 *
 * - **`type: 'manipulator'`** — «Մանիպուլյատորով էվակուատոր», one option of a
 *   required single-choice select. A driver whose truck *is* a manipulator
 *   picks it here, and for them the checkbox below is a redundant second ask.
 * - **`manipulator: true`** — «Ունի մանիպուլյատոր», an optional equipment
 *   checkbox. This is the honest answer for a flatbed that also carries a
 *   crane, which is a real vehicle and not a mistake.
 *
 * The filter used to read only the boolean, so a driver who picked the type and
 * left the redundant box alone was **invisible** to «Մանիպուլյատոր» — the exact
 * customers looking for them never saw them. Meanwhile the filter did return
 * flatbeds that had ticked the box, whose cards then read «Հարթակով
 * էվակուատոր», which looks like the filter is broken even though that one was
 * correct.
 *
 * So either answer counts, and every place that asks the question goes through
 * here: the filter (`matchesFilters`) and the profile's own
 * «Մանիպուլյատոր՝ Այո/Ոչ» row. Those two disagreeing is what made the bug
 * visible, and one predicate is what stops them disagreeing again.
 *
 * The backend derives the boolean the same way on every write (see
 * `AdminService.approve` and `MyTowTruckService.updateMine`, which treat it
 * exactly as they treat `works24Hours`), so new rows are self-consistent. This
 * still has to hold the union because rows written before that do not.
 */
export function hasManipulator(vehicle: { type: string; manipulator: boolean }): boolean {
  return vehicle.manipulator || vehicle.type === VehicleType.Manipulator
}
