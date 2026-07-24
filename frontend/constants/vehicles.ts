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
