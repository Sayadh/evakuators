import { VehicleType } from '~/types/enums'
import type { SelectOption } from '~/types/common'
import { formatCapacity } from '~/utils/formatters'

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

/**
 * Human copy for a truck's exact capacity — "մինչև X տ" for every bounded
 * bucket, and the open top bucket's own label for the one that has none.
 *
 * The bug this fixes: `representativeCapacityTons()` stores `minTons + 2`
 * (12) for the open-ended "over-10" bucket purely so `matchesCapacityRange`
 * has a figure strictly inside the bucket to filter on — that stand-in was
 * never meant to be shown to a customer. Every bounded bucket's
 * representative figure IS its real `maxTons`, so "մինչև X" stays an honest
 * summary there; showing "մինչև 12 տ" for a driver who only ever said "10
 * տոննայից ավելի" invents a ceiling nobody stated, and disagreed with the
 * exact same range shown in the registration form and the public filter.
 */
export function capacityDisplayText(capacityTons: number): string {
  const bucket = CAPACITY_RANGE_OPTIONS.find((option) =>
    matchesCapacityRange(capacityTons, option.value),
  )
  if (bucket && bucket.maxTons === undefined) return bucket.label
  return `մինչև ${formatCapacity(capacityTons)}`
}

export const VEHICLE_TYPE_OPTIONS: SelectOption<VehicleType>[] = Object.entries(
  VEHICLE_TYPE_LABELS,
).map(([value, label]) => ({ value: value as VehicleType, label }))

/**
 * The band a stored exact tonnage falls into.
 *
 * The round trip the other way from `representativeCapacityTons`: a driver only
 * ever picked a band, `TowTruck.capacityTons` stores a float, and every form
 * that shows a driver their own capacity has to show the band they chose rather
 * than the float it became. Built on `matchesCapacityRange` — the *same*
 * predicate the public filter uses — so the band in a driver's form is always
 * the band a customer would find them under.
 *
 * Lives here rather than in `dashboard.vue`, where it started, because the
 * registration review page and the specialist forms need the identical mapping
 * and a second copy is a second answer.
 */
export function capacityRangeFromTons(capacityTons: number | null | undefined): string {
  if (typeof capacityTons !== 'number' || !Number.isFinite(capacityTons)) return ''
  return CAPACITY_RANGE_OPTIONS.find((option) => matchesCapacityRange(capacityTons, option.value))
    ?.value ?? ''
}

/**
 * One extra technical question a specialist truck is asked.
 *
 * `key` is the column it writes to, so the forms, the API payload and the
 * public profile all name the same thing and there is no mapping table to keep
 * in sync. `label` is per vehicle type on purpose: `maxLoadTons` is «Հարթակի
 * առավելագույն բեռնատարողություն» on a manipulator (it has a crane rating too,
 * and the two must be distinguishable) and plain «Առավելագույն
 * բեռնատարողություն» on a transporter, which has only the one.
 */
export interface SpecialistSpecField {
  key: 'craneCapacityTons' | 'craneReachM' | 'maxLoadTons' | 'platformLoadHeightCm'
  label: string
  /** Rendered as a suffix, never stored — see docs/taxonomies.md § "ask for the value, not the format" */
  unit: string
  min: number
  max: number
  /**
   * Only `maxLoadTons` is, and only because it REPLACES the capacity band
   * picker for these two types (see `usesExactCapacity`). Something has to
   * produce `TowTruck.capacityTons`, which is NOT NULL.
   */
  required: boolean
  placeholder: string
}

/**
 * The technical questions «Մանիպուլյատոր» and «Ծանր տեխնիկայի էվակուատոր» get
 * instead of the generic ones.
 *
 * ## Keyed by vehicle type, never by the heavy-equipment flag
 *
 * A manipulator that also moves heavy machinery is still a manipulator: the
 * customer needs its crane rating and reach, not a transporter's loading
 * height. So ticking «Ծանր տեխնիկայի տեղափոխում» never changes which of these
 * two sets is asked — the truck does.
 *
 * ## Platform length/width are deliberately absent
 *
 * Both types want them, but every type already has them
 * (`PlatformDimensionsInput.vue`, writing the existing `platformLengthM` /
 * `platformWidthM` columns with a both-or-neither rule). Repeating them here
 * would be a second input bound to the same column, which is the duplicate-field
 * problem this whole taxonomy module exists to avoid.
 */
export const SPECIALIST_SPEC_FIELDS: Partial<Record<VehicleType, SpecialistSpecField[]>> = {
  [VehicleType.Manipulator]: [
    {
      key: 'craneCapacityTons',
      label: 'Կռունկի առավելագույն բեռնատարողություն',
      unit: 'տ',
      min: 0.1,
      max: 200,
      required: false,
      placeholder: '5',
    },
    {
      key: 'craneReachM',
      label: 'Կռունկի թևի առավելագույն հասանելիություն',
      unit: 'մ',
      min: 0.5,
      max: 80,
      required: false,
      placeholder: '12',
    },
    {
      key: 'maxLoadTons',
      label: 'Հարթակի առավելագույն բեռնատարողություն',
      unit: 'տ',
      min: 0.1,
      max: 200,
      required: true,
      placeholder: '10',
    },
  ],
  [VehicleType.HeavyDuty]: [
    {
      key: 'maxLoadTons',
      label: 'Առավելագույն բեռնատարողություն',
      unit: 'տ',
      min: 0.1,
      max: 200,
      required: true,
      placeholder: '25',
    },
    {
      key: 'platformLoadHeightCm',
      label: 'Հարթակի բեռնման բարձրություն',
      unit: 'սմ',
      min: 5,
      max: 400,
      required: false,
      placeholder: '90',
    },
  ],
}

/** The extra technical questions for this vehicle type — empty for ordinary evacuators */
export function specialistSpecFieldsFor(vehicleType: string): SpecialistSpecField[] {
  return SPECIALIST_SPEC_FIELDS[vehicleType as VehicleType] ?? []
}

/**
 * Whether this type states its capacity as an exact tonnage rather than a band.
 *
 * A band is the right question for an ordinary evacuator: a driver does not
 * know their truck's exact rating and the customer only needs to know a saloon
 * fits. It is the wrong question for a machinery transporter, where «10
 * տոննայից ավելի» is the only band that ever applies and it answers nothing —
 * the whole decision is whether this truck takes a 22-tonne excavator.
 *
 * So these two types are asked `maxLoadTons` instead, and the band is derived
 * from it (`capacityRangeFromTons`) purely so `capacityRange` keeps its
 * existing shape in the moderation queue. `capacityTons` is written from the
 * exact figure, not from the band's representative value — see
 * `AdminService.approve`.
 */
export function usesExactCapacity(vehicleType: string): boolean {
  return specialistSpecFieldsFor(vehicleType).some((field) => field.key === 'maxLoadTons')
}

/**
 * Whether «Առկա են անիվային ռոլիկներ» is a question this vehicle can answer.
 *
 * Wheel skates are trolleys you slide under a car whose wheels will not turn,
 * so it can be **rolled** onto a platform. That is a car-loading problem, and
 * only the two ordinary evacuators have it. A manipulator lifts by crane and a
 * machinery transporter is driven or winched onto a low deck — neither ever
 * touches a skate, so the checkbox was asking both of them about equipment
 * their job has no use for, and a stray tick would publish it.
 *
 * The two types it excludes are the same two `SPECIALIST_VEHICLE_TYPES` names,
 * and that is a coincidence of which vehicles exist rather than the same
 * question: that list answers "should this be hidden from general discovery",
 * this one answers "does this truck load cars by rolling them". Written out
 * rather than reusing the predicate so a third specialist type — a low-loader,
 * say — can answer them differently without either rule quietly following the
 * other.
 */
export function asksWheelSkates(vehicleType: string): boolean {
  return vehicleType !== VehicleType.Manipulator && vehicleType !== VehicleType.HeavyDuty
}

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

/**
 * Which specialist landing page a truck's OWN vehicle belongs to, from public
 * fields alone — `undefined` for an ordinary evacuator.
 *
 * Built for `TowTrucksService.getSimilar`: a manipulator's own profile page
 * must recommend other manipulators nearby, not ordinary flatbeds, and the
 * same for «Ծանր տեխնիկա». `heavyEquipment` (the admin-set half of that
 * union) is not read here and cannot be — the public profile withholds it
 * (see `TowTruckVehicle.heavyEquipment`) — so this can only ever see the
 * `vehicleType` half; the backend still applies its full union when it
 * narrows the candidates a caller gets back for the value returned here.
 */
export function publicVehicleTypeCategory(vehicle: {
  type: string
  manipulator: boolean
}): VehicleType.Manipulator | VehicleType.HeavyDuty | undefined {
  if (hasManipulator(vehicle)) return VehicleType.Manipulator
  if (vehicle.type === VehicleType.HeavyDuty) return VehicleType.HeavyDuty
  return undefined
}

/**
 * The vehicle types that are listed on their own landing page and nowhere else.
 *
 * «Մանիպուլյատոր» (`/manipulator`) and «Ծանր տեխնիկա» (`/tsanr-tehnika`) are
 * not shown on a city, marz or Yerevan listing, in the homepage's featured
 * picks, in the per-area counters, or in the nearest-driver search: someone
 * browsing a town or pressing "find the nearest evacuator" is describing an
 * ordinary car, and a truck built to lift an excavator is not an answer to it.
 *
 * ## The TYPE alone — not `hasManipulator`, not the heavy-equipment flag
 *
 * The unions answer "can this truck ALSO do the specialist job", which is what
 * the landing pages ask, and is why a flatbed carrying a crane belongs on
 * `/manipulator`. This answers "is that job all the truck is FOR", which is
 * what hiding one asks. A flatbed with a crane is an ordinary evacuator, and
 * removing it from every city page because of one checkbox would delete real
 * supply from the listings.
 *
 * ## This copy is the mock-mode mirror, not the boundary
 *
 * The real exclusion happens in Postgres — see `SPECIALIST_VEHICLE_TYPES` in
 * `backend/src/tow-trucks/vehicle-types.ts`, a MANUAL SYNC POINT with this
 * list. This copy exists so `towTrucksService`'s mock branches list the same
 * drivers the API would, which is the whole point of the mock/API switch.
 * `frontend/tests/specialistVehicleTypes.spec.ts` reads the backend file as
 * text so the two cannot drift.
 */
export const SPECIALIST_VEHICLE_TYPES: VehicleType[] = [
  VehicleType.Manipulator,
  VehicleType.HeavyDuty,
]

/** Whether this type is landing-page-only — see SPECIALIST_VEHICLE_TYPES */
export function isSpecialistVehicleType(type: string): boolean {
  return (SPECIALIST_VEHICLE_TYPES as string[]).includes(type)
}

/**
 * Vehicle-type options for the public listing filter (`Տեխնիկա`, city/marz/
 * Yerevan pages) — `flatbed` and `sliding-platform` today.
 *
 * Derived from `VEHICLE_TYPE_OPTIONS` by excluding `SPECIALIST_VEHICLE_TYPES`,
 * rather than listed by hand, for the same reason the general-discovery
 * exclusion itself is centralised: `manipulator` and `heavy-duty` are already
 * absent from every truck this filter runs over (see
 * `SPECIALIST_VEHICLE_TYPES`), so offering them here would be a checkbox that
 * always produces zero results. A third ordinary type added to
 * `VEHICLE_TYPE_LABELS` appears here automatically; a third specialist type
 * stays out the same way.
 *
 * Matched by plain equality in `matchesFilters` — `flatbed` and
 * `sliding-platform` are not asked twice at registration the way
 * «Մանիպուլյատոր» is, so there is no union to apply here.
 */
export const GENERAL_LISTING_VEHICLE_TYPE_OPTIONS: SelectOption<VehicleType>[] =
  VEHICLE_TYPE_OPTIONS.filter((option) => !isSpecialistVehicleType(option.value))
