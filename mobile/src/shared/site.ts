/**
 * The website's own domain modules and words, as the app uses them.
 *
 * Everything imported from `~/…` here is a file of the WEBSITE
 * (frontend/{constants,data,utils,types,i18n}) — see mobile/metro.config.js
 * for why the app imports them instead of keeping copies. This file is the one
 * place that does, so the rest of the app has a single seam to look at.
 *
 * `siteT` reads the website's own locale files, so a label on the app's
 * registration form is word for word the label on evakuators.am/register.
 */
import hyMessages from '~/i18n/locales/hy.json'
import ruMessages from '~/i18n/locales/ru.json'
import { localizedPlaceName, type PlaceKind } from '~/i18n/placeNames'
import { SERVICE_LABELS, type ServiceCategory } from '~/constants/services'
import {
  CAPACITY_RANGE_OPTIONS,
  VEHICLE_TYPE_DESCRIPTIONS,
  VEHICLE_TYPE_LABELS,
  type SpecialistSpecField,
} from '~/constants/vehicles'
import { VehicleType } from '~/types/enums'
import type { Language } from '../i18n'

export type { PlaceKind }

type Messages = Record<string, unknown>
const MESSAGES: Record<Language, Messages> = { hy: hyMessages as Messages, ru: ruMessages as Messages }

function lookup(messages: Messages, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((node, key) => (node as Messages | undefined)?.[key], messages)
  return typeof value === 'string' ? value : undefined
}

/**
 * The website's copy for `key` in `language`, Armenian when the language has
 * none, and the key itself only if neither does (a visible bug, not a blank).
 * `{name}` placeholders are filled from `params`, as vue-i18n does.
 */
export function siteT(language: Language, key: string, params?: Record<string, string | number>): string {
  const text = lookup(MESSAGES[language], key) ?? lookup(MESSAGES.hy, key) ?? key
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : text
}

export function siteHas(language: Language, key: string): boolean {
  return lookup(MESSAGES[language], key) !== undefined
}

/**
 * The catalogue's words — the same rules as the website's `useCatalogLabels`
 * (frontend/composables/useCatalogLabels.ts), minus Vue: the locale's string
 * when it has one, otherwise the Armenian constant.
 */
const CAPACITY_KEYS: Record<string, string> = {
  'up-to-2': 'upTo2',
  '2-3.5': 'from2to35',
  '3.5-5': 'from35to5',
  '5-10': 'from5to10',
  'over-10': 'over10',
}

const SPEC_FIELD_LABEL_KEYS: Record<string, string> = {
  craneCapacityTons: 'truck.craneCapacity',
  craneReachM: 'truck.craneReach',
  platformLoadHeightCm: 'truck.platformLoadHeight',
}

const SPEC_FIELD_UNIT_KEYS: Record<string, string> = { 'տ': 'ton', 'մ': 'metre', 'սմ': 'centimetre' }

export function catalog(language: Language) {
  const translate = (key: string, fallback: string) => (siteHas(language, key) ? siteT(language, key) : fallback)
  return {
    serviceLabel: (slug: string) => translate(`services.${slug}`, (SERVICE_LABELS as Record<string, string>)[slug] ?? slug),
    vehicleTypeLabel: (type: string) => translate(`vehicleTypes.${type}`, (VEHICLE_TYPE_LABELS as Record<string, string>)[type] ?? type),
    vehicleTypeHint: (type: string) => translate(`vehicleTypeHints.${type}`, (VEHICLE_TYPE_DESCRIPTIONS as Record<string, string>)[type] ?? ''),
    capacityRangeLabel: (value: string) => {
      const option = CAPACITY_RANGE_OPTIONS.find((item) => item.value === value)
      if (!option) return ''
      const key = CAPACITY_KEYS[value]
      return key ? translate(`capacity.${key}`, option.label) : option.label
    },
    specFieldLabel: (field: SpecialistSpecField, vehicleType: string) => {
      if (field.key === 'maxLoadTons') {
        return translate(vehicleType === VehicleType.Manipulator ? 'truck.platformMaxLoad' : 'truck.maxLoad', field.label)
      }
      const key = SPEC_FIELD_LABEL_KEYS[field.key]
      return key ? translate(key, field.label) : field.label
    },
    specFieldUnit: (unit: string) => {
      const key = SPEC_FIELD_UNIT_KEYS[unit]
      return key ? translate(`units.${key}`, unit) : unit
    },
    categoryTitle: (category: ServiceCategory) => translate(`serviceCategories.${category.key}`, category.title),
    categoryHint: (category: ServiceCategory) => translate(`serviceCategories.${category.key}Hint`, category.description),
    placeName: (kind: PlaceKind, slug: string, armenianName: string) => localizedPlaceName(kind, slug, armenianName, language),
  }
}

export type Catalog = ReturnType<typeof catalog>
