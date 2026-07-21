import { CapacityOption, VehicleType } from '~/types/enums'
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

/** Capacity ranges for the registration form ("Առավելագույն բեռնատարողություն") */
export const CAPACITY_RANGE_OPTIONS: SelectOption[] = [
  { value: 'up-to-2', label: 'Մինչև 2 տոննա' },
  { value: '2-3.5', label: '2–3.5 տոննա' },
  { value: '3.5-5', label: '3.5–5 տոննա' },
  { value: '5-10', label: '5–10 տոննա' },
  { value: 'over-10', label: '10 տոննայից ավելի' },
]

export const CAPACITY_OPTIONS: SelectOption<CapacityOption>[] = [
  { value: CapacityOption.UpTo2, label: 'Մինչև 2 տոննա' },
  { value: CapacityOption.UpTo5, label: 'Մինչև 5 տոննա' },
  { value: CapacityOption.UpTo10, label: 'Մինչև 10 տոննա' },
]

export const VEHICLE_TYPE_OPTIONS: SelectOption<VehicleType>[] = Object.entries(
  VEHICLE_TYPE_LABELS,
).map(([value, label]) => ({ value: value as VehicleType, label }))
