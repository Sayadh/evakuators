import { SERVICE_LABELS } from '~/constants/services'
import {
  CAPACITY_RANGE_OPTIONS,
  matchesCapacityRange,
  VEHICLE_TYPE_DESCRIPTIONS,
  VEHICLE_TYPE_LABELS,
} from '~/constants/vehicles'
import type { ServiceType, VehicleType } from '~/types/enums'
import { formatCapacity } from '~/utils/formatters'

/**
 * The catalogue's own vocabulary — services, vehicle types, capacity bands —
 * in the language being rendered.
 *
 * ## Why the labels moved out of the constants
 *
 * `SERVICE_LABELS`, `VEHICLE_TYPE_LABELS` and `CAPACITY_RANGE_OPTIONS` are
 * `Record<enum, string>` — one string per slug, in Armenian. That shape has no
 * room for a second language, and the slug is the only thing that is actually
 * constant: the label is presentation. So the slug stays the key everywhere
 * (in the URL, in the store, in the API) and the words live in the locale
 * files with the rest of the copy.
 *
 * The Armenian constants stay exactly as they are and stay the fallback — a
 * service added to the enum without a translation renders its Armenian label
 * rather than a raw `services.new-slug` key, which is the failure mode
 * `tests/localeFiles.spec.ts` cannot catch on its own for a slug set this size.
 *
 * ## Why one composable and not four
 *
 * These four vocabularies always travel together — a driver card shows a
 * vehicle type, a capacity and a list of services in the same breath — so a
 * component that needs one usually needs two, and four `useI18n()` calls in
 * one `setup` is four chances to forget the reactivity.
 */

/**
 * Capacity bands are keyed by hand: their slugs contain a dot (`2-3.5`), and
 * `vue-i18n` reads a dot in a key path as one more level of nesting, so
 * `t('capacity.2-3.5')` would look for `capacity → 2-3 → 5` and find nothing.
 */
const CAPACITY_KEYS: Record<string, string> = {
  'up-to-2': 'upTo2',
  '2-3.5': 'from2to35',
  '3.5-5': 'from35to5',
  '5-10': 'from5to10',
  'over-10': 'over10',
}

export interface CatalogLabels {
  /** «Վթարված մեքենաների տեղափոխում» for `accident-transport` */
  serviceLabel: (slug: string) => string
  /** «Հարթակով էվակուատոր» for `flatbed` */
  vehicleTypeLabel: (type: string) => string
  /** The one-line explanation under a vehicle type */
  vehicleTypeHint: (type: string) => string
  /** «Մինչև 2 տոննա» for the band slug `up-to-2` */
  capacityRangeLabel: (value: string) => string
  /** What a card shows for an exact tonnage: «մինչև 3.5 տ», or the open band */
  capacityText: (capacityTons: number) => string
}

export function useCatalogLabels(): CatalogLabels {
  const { t, te, locale } = useI18n()

  /** The locale string if it has this key, otherwise the Armenian fallback */
  const translate = (key: string, fallback: string): string =>
    te(key) ? t(key) : fallback

  const capacityRangeLabel = (value: string): string => {
    const option = CAPACITY_RANGE_OPTIONS.find((item) => item.value === value)
    if (!option) return ''
    const key = CAPACITY_KEYS[value]
    return key ? translate(`capacity.${key}`, option.label) : option.label
  }

  return {
    serviceLabel: (slug) =>
      translate(`services.${slug}`, SERVICE_LABELS[slug as ServiceType] ?? slug),
    vehicleTypeLabel: (type) =>
      translate(`vehicleTypes.${type}`, VEHICLE_TYPE_LABELS[type as VehicleType] ?? type),
    vehicleTypeHint: (type) =>
      translate(`vehicleTypeHints.${type}`, VEHICLE_TYPE_DESCRIPTIONS[type as VehicleType] ?? ''),
    capacityRangeLabel,
    capacityText: (capacityTons) => {
      // The open-ended top band («10 տոննայից ավելի») is the one case where
      // «մինչև X» would be a lie, so it renders the band's own words instead.
      const bucket = CAPACITY_RANGE_OPTIONS.find((option) =>
        matchesCapacityRange(capacityTons, option.value),
      )
      if (bucket && bucket.maxTons === undefined) return capacityRangeLabel(bucket.value)
      return t('capacity.upTo', { value: formatCapacity(capacityTons, locale.value) })
    },
  }
}
