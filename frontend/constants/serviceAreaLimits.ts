import { hasManipulator, VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { LocationType, VehicleType } from '~/types/enums'
import type { SelectOption } from '~/types/common'
import { resolveAreaType, YEREVAN_REGION_SLUG } from '~/utils/geography'

/**
 * Who this whole file does NOT apply to.
 *
 * The budget below answers one question: a roadside evacuator claiming the
 * whole country is useless to the person standing next to a broken car, because
 * the driver 90 km away will not come. A crane truck or a machinery transporter
 * is the opposite case — dispatched against a **booked job** at an agreed
 * price, for which driving Yerevan → Kapan is normal — and there are few enough
 * of them that capping their reach empties the pages they exist to fill.
 *
 * So those drivers are offered «Ամբողջ Հայաստան» or a free choice of marzes
 * instead, with no city count and no distance guidance.
 *
 * Uses the two unions, not `isSpecialistVehicleType`: a flatbed carrying a
 * crane travels for the same booked jobs, and it keeps every ordinary city
 * listing it had, because general discovery excludes on the TYPE alone.
 *
 * MANUAL SYNC POINT: `hasUncappedCoverage` in
 * `backend/src/tow-trucks/service-area-limits.ts` is the enforcing twin. This
 * copy decides what the picker OFFERS; that one decides what is accepted.
 */
export function hasUncappedCoverage(vehicle: {
  vehicleType: string
  manipulator?: boolean
  heavyEquipment?: boolean
}): boolean {
  return (
    hasManipulator({ type: vehicle.vehicleType, manipulator: vehicle.manipulator ?? false }) ||
    vehicle.heavyEquipment === true ||
    vehicle.vehicleType === VehicleType.HeavyDuty
  )
}

/** The two coverage answers an uncapped driver chooses between */
export const COVERAGE_MODE_OPTIONS = [
  { value: 'all-armenia', label: 'Ամբողջ Հայաստան' },
  { value: 'regions', label: 'Ընտրված մարզերում' },
] as const

export type CoverageMode = (typeof COVERAGE_MODE_OPTIONS)[number]['value']

/**
 * `COVERAGE_MODE_OPTIONS`'s labels, in ru/en. Kept apart from the constant
 * above (which stays Armenian and unchanged — the dashboard's copy of this
 * picker still reads it directly) for the same reason `buildLocationSeo` and
 * the other plain, non-composable helpers in this codebase branch on a
 * `locale` parameter instead of a vue-i18n key: this file has no access to
 * `useI18n()`.
 */
const COVERAGE_MODE_LABELS: Record<string, Record<CoverageMode, string>> = {
  ru: { 'all-armenia': 'Вся Армения', regions: 'В выбранных марзах' },
  en: { 'all-armenia': 'All of Armenia', regions: 'In selected regions' },
}

/** `COVERAGE_MODE_OPTIONS`, localized — `locale` defaults to Armenian */
export function coverageModeOptions(locale: string = 'hy'): SelectOption<CoverageMode>[] {
  const labels = COVERAGE_MODE_LABELS[locale]
  return COVERAGE_MODE_OPTIONS.map((option) => ({
    value: option.value,
    label: labels?.[option.value] ?? option.label,
  }))
}

/**
 * Why an uncapped driver is being offered the nationwide choice, in their own
 * words — «Դուք ընտրել եք "Մանիպուլյատորով էվակուատոր"», so the appearance of a
 * different question is explained rather than just happening.
 */
const VEHICLE_TYPE_LABELS_BY_LOCALE: Record<string, Record<VehicleType, string>> = {
  ru: {
    [VehicleType.Flatbed]: 'Эвакуатор с платформой',
    [VehicleType.SlidingPlatform]: 'Эвакуатор со сдвижной платформой',
    [VehicleType.Manipulator]: 'Эвакуатор с манипулятором',
    [VehicleType.HeavyDuty]: 'Эвакуатор для тяжёлой техники',
  },
  en: {
    [VehicleType.Flatbed]: 'Flatbed tow truck',
    [VehicleType.SlidingPlatform]: 'Sliding-platform tow truck',
    [VehicleType.Manipulator]: 'Crane tow truck',
    [VehicleType.HeavyDuty]: 'Heavy-duty tow truck',
  },
}

const UNCAPPED_REASON_COPY: Record<
  string,
  { byType: (typeLabel: string) => string; manipulator: string; heavyEquipment: string }
> = {
  hy: {
    byType: (typeLabel) =>
      `Քանի որ ընտրել եք «${typeLabel}», կարող եք սահմանել ավելի լայն սպասարկման տարածք։`,
    manipulator: 'Քանի որ նշել եք, որ ունեք մանիպուլյատոր, կարող եք սահմանել ավելի լայն սպասարկման տարածք։',
    heavyEquipment: 'Քանի որ նշել եք «Ծանր տեխնիկայի տեղափոխում», կարող եք սահմանել ավելի լայն սպասարկման տարածք։',
  },
  ru: {
    byType: (typeLabel) =>
      `Поскольку вы выбрали «${typeLabel}», вы можете задать более широкую зону обслуживания.`,
    manipulator: 'Поскольку вы указали, что у вас есть манипулятор, вы можете задать более широкую зону обслуживания.',
    heavyEquipment: 'Поскольку вы указали «Перевозка тяжёлой техники», вы можете задать более широкую зону обслуживания.',
  },
  en: {
    byType: (typeLabel) => `Since you selected "${typeLabel}", you can set a wider service area.`,
    manipulator: 'Since you indicated that you have a crane, you can set a wider service area.',
    heavyEquipment: 'Since you selected "Heavy equipment transport", you can set a wider service area.',
  },
}

export function uncappedCoverageReason(
  vehicle: {
    vehicleType: string
    manipulator?: boolean
    heavyEquipment?: boolean
  },
  locale: string = 'hy',
): string {
  const typeLabels = VEHICLE_TYPE_LABELS_BY_LOCALE[locale] ?? VEHICLE_TYPE_LABELS
  const typeLabel = typeLabels[vehicle.vehicleType as VehicleType]
  const copy = UNCAPPED_REASON_COPY[locale] ?? UNCAPPED_REASON_COPY.hy!
  if (vehicle.vehicleType === VehicleType.Manipulator || vehicle.vehicleType === VehicleType.HeavyDuty) {
    return copy.byType(typeLabel)
  }
  if (vehicle.manipulator) {
    return copy.manipulator
  }
  return copy.heavyEquipment
}

/**
 * How many places a driver may claim to serve.
 *
 * ## The rule, in one sentence
 *
 * Yerevan is coverage of a *city*, not of a place — so its districts never
 * count. Everything else (a marz city, or a road corridor like «Գառնի–Գեղարդ»)
 * counts one each, and the budget for those is **2 when Yerevan is one of the
 * chosen regions, 5 when it is not**.
 *
 * That single sentence produces all four cases the product asked for:
 *
 * | Chosen regions | Districts | Cities + corridors |
 * | --- | --- | --- |
 * | Yerevan only | all 12, unlimited | — (none available) |
 * | Yerevan + one marz | all 12, unlimited | 2 |
 * | one marz | — | 3 |
 * | two marzes | — | 5 **in total**, not 5 each |
 *
 * The two-marz row is why the budget is counted across the whole selection
 * rather than per region: a driver picking Lori + Armavir gets five places to
 * spread between them however they like.
 *
 * A second marz raises the budget from 3 to 5 rather than doubling it. Covering
 * two marzes genuinely takes more places than covering one, but not twice as
 * many — the extra two are for the border between them, not for a second full
 * territory.
 *
 * ## Why a corridor costs the same as a city
 *
 * «Գառնի–Գեղարդ» is one answer to "where do you work", exactly like «Աշտարակ»
 * is. It is deliberately NOT cheaper: the whole point of the cap is that a
 * listing which claims everywhere is worth nothing to the person searching, and
 * a corridor is as strong a claim as a town.
 *
 * ## MANUAL SYNC POINT
 *
 * `backend/src/tow-trucks/service-area-limits.ts` is this file's twin and must
 * change with it. There is no shared code between the two projects (see
 * CLAUDE.md) and nothing catches a drift at compile time — the frontend copy
 * decides what a driver is *offered*, the backend copy decides what is
 * *accepted*, and only the second one is a real boundary.
 */

/** Budget when exactly one marz is chosen and Yerevan is not among them */
export const MAX_AREAS_ONE_REGION = 3

/** Budget when two marzes are chosen and Yerevan is not among them — shared between both */
export const MAX_AREAS_TWO_REGIONS = 5

/**
 * Budget when Yerevan IS among the regions.
 *
 * Lower on purpose rather than as a penalty: a driver already covering all of
 * Yerevan is committing most of their day to it, so a wide second marz on top
 * would be a claim they cannot serve.
 */
export const MAX_AREAS_WITH_YEREVAN = 2

/** A driver may cover at most this many marzes — e.g. Yerevan + Kotayk, or Lori + Armavir */
export const MAX_REGIONS = 2

/**
 * Yerevan's districts are exempt, so only these types are charged against the
 * budget. Kept as a predicate rather than an inline `!== District` so the
 * frontend and backend copies read identically.
 */
export function countsTowardsLimit(type: LocationType | string): boolean {
  return type !== LocationType.District
}

export function isYerevanSelected(regionSlugs: readonly string[]): boolean {
  return regionSlugs.includes(YEREVAN_REGION_SLUG)
}

/**
 * The budget for the currently chosen regions.
 *
 * Yerevan short-circuits everything: a driver covering all of Yerevan plus a
 * marz gets 2 there regardless of how the rest is counted, because Yerevan
 * itself is already most of a working day.
 *
 * With no region chosen there is nothing to select yet, so the one-region
 * budget is returned as the honest starting value — the counter reads
 * "0 of 3" before the first marz is ticked, not "0 of 5" followed by a drop.
 */
export function maxAreasFor(regionSlugs: readonly string[]): number {
  if (isYerevanSelected(regionSlugs)) return MAX_AREAS_WITH_YEREVAN
  return regionSlugs.length >= 2 ? MAX_AREAS_TWO_REGIONS : MAX_AREAS_ONE_REGION
}

/**
 * How much of the budget a selection uses.
 *
 * Takes resolved types rather than slugs so it cannot disagree with the picker
 * about what a given slug is — the frontend resolves types once, in one place
 * (`resolveAreaType`), and both the counter and the validator read the result.
 */
export function countLimitedAreas(types: readonly (LocationType | string)[]): number {
  return types.filter(countsTowardsLimit).length
}

/**
 * The message a driver sees when they are over budget.
 *
 * Names the number rather than saying "too many", because the driver's next
 * action is to remove a specific tick and they need to know how many.
 */
const TOO_MANY_AREAS_MESSAGE: Record<string, (max: number) => string> = {
  hy: (max) => `Կարող եք ընտրել առավելագույնը ${max} քաղաք կամ ուղղություն։ Հեռացրեք ավելորդները։`,
  ru: (max) => `Можно выбрать не более ${max} городов или направлений. Уберите лишние.`,
  en: (max) => `You can select at most ${max} cities or directions. Remove the extra ones.`,
}

export function tooManyAreasMessage(max: number, locale: string = 'hy'): string {
  return (TOO_MANY_AREAS_MESSAGE[locale] ?? TOO_MANY_AREAS_MESSAGE.hy!)(max)
}

const SERVICE_AREA_VALIDATION_MESSAGES: Record<string, { noRegion: string; noArea: string }> = {
  hy: { noRegion: 'Ընտրեք առնվազն մեկ մարզ', noArea: 'Ընտրեք առնվազն մեկ քաղաք կամ շրջան' },
  ru: { noRegion: 'Выберите хотя бы один марз', noArea: 'Выберите хотя бы один город или район' },
  en: { noRegion: 'Select at least one region', noArea: 'Select at least one city or district' },
}

/**
 * One validator for both forms, returning `''` when the selection is fine.
 *
 * Registration and the dashboard must accept exactly the same selections —
 * anything a driver can choose at sign-up has to stay changeable afterwards, or
 * fixing a mistake means registering again (CLAUDE.md § "Registration and the
 * driver dashboard must offer the same fields"). Two copies of this check would
 * be two chances for that to stop being true.
 *
 * Takes slugs and resolves the types itself, so a caller cannot pass a
 * differently-derived type list and get a different answer than the picker
 * shows.
 */
export function validateServiceAreaSelection(
  regionSlugs: readonly string[],
  areaSlugs: readonly string[],
  /**
   * The truck, when the caller knows it. Omitted means "apply the cap", which
   * is the safe default: the exemption is a widening, so degrading to the
   * stricter rule can only ever refuse something the API would have accepted,
   * never accept something it will reject.
   */
  vehicle?: {
    vehicleType: string
    manipulator?: boolean
    heavyEquipment?: boolean
    servesAllArmenia?: boolean
  },
  locale: string = 'hy',
): string {
  const messages =
    SERVICE_AREA_VALIDATION_MESSAGES[locale] ?? SERVICE_AREA_VALIDATION_MESSAGES.hy!

  if (vehicle && hasUncappedCoverage(vehicle)) {
    // «Ամբողջ Հայաստան» is the complete answer — there is no list to check.
    if (vehicle.servesAllArmenia) return ''
    return regionSlugs.length === 0 ? messages.noRegion : ''
  }

  if (areaSlugs.length === 0) return messages.noArea

  const max = maxAreasFor(regionSlugs)
  const used = countLimitedAreas(areaSlugs.map(resolveAreaType))
  return used > max ? tooManyAreasMessage(max, locale) : ''
}
