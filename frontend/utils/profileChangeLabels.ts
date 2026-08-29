import { SERVICE_LABELS } from '~/constants/services'
import {
  CAPACITY_RANGE_OPTIONS,
  representativeCapacityTons,
  VEHICLE_TYPE_LABELS,
} from '~/constants/vehicles'
import type { ServiceType, VehicleType } from '~/types/enums'

/**
 * Turning a stored diff into something a moderator can read.
 *
 * ## Why this is on the frontend
 *
 * The API sends the diff with raw values on both sides — `flatbed`, `abovyan`,
 * `['towing', 'winching']` — because the words for a service, a city or a
 * vehicle type live in this app's static TypeScript data and the backend has
 * none of them (CLAUDE.md). It cannot label its own response without acquiring
 * a taxonomy it deliberately does not have.
 *
 * So the panel does it here, with the exact same tables the public site renders
 * from. A moderator therefore reads the words a customer would see, not the
 * slugs a database holds.
 */

/**
 * Field name → what a person calls it.
 *
 * Deliberately the same wording as the labels on the forms themselves
 * («Հիմնական հեռախոսահամար», not "secondaryPhone" or "Phone 2"), so a moderator
 * reading a diff and a driver reading the form are looking at the same word.
 *
 * A field with no entry falls back to its raw name rather than being hidden:
 * an unlabelled line is a missing translation, and hiding it would silently
 * drop a change from the review.
 */
export const PROFILE_FIELD_LABELS: Record<string, string> = {
  driverName: 'Անուն Ազգանուն',
  companyName: 'Կազմակերպության անուն',
  secondaryPhone: 'Երկրորդ հեռախոսահամար',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',

  vehicleBrand: 'Մակնիշ',
  vehicleModel: 'Մոդել',
  vehicleYear: 'Տարեթիվ',
  vehicleType: 'Մեքենայի տեսակ',
  capacityTons: 'Բեռնատարողություն',
  platformLengthM: 'Հարթակի երկարություն (մ)',
  platformWidthM: 'Հարթակի լայնություն (մ)',
  // The specialist figures. `maxLoadTons` is worded neutrally rather than as
  // «Հարթակի…»: the same column is «Հարթակի առավելագույն բեռնատարողություն» on
  // a manipulator's form and plain «Առավելագույն բեռնատարողություն» on a
  // transporter's, and a diff has no vehicle type in front of it to choose
  // between them.
  craneCapacityTons: 'Կռունկի բեռնատարողություն (տ)',
  craneReachM: 'Կռունկի թևի հասանելիություն (մ)',
  maxLoadTons: 'Առավելագույն բեռնատարողություն (տ)',
  platformLoadHeightCm: 'Հարթակի բեռնման բարձրություն (սմ)',
  winch: 'Ճախարակ',
  manipulator: 'Մանիպուլյատոր',
  wheelSkates: 'Անիվային ռոլիկներ',
  doubleDeck: '2-հարկանի էվակուատոր',
  towHitch: 'Կցորդ',
  heavyEquipment: 'Ծանր տեխնիկայի տեղափոխում',
  servesAllArmenia: 'Սպասարկում ամբողջ Հայաստանում',

  description: 'Նկարագրություն',
  services: 'Ծառայություններ',
  workingHoursText: 'Աշխատանքային ժամեր',

  locationName: 'Հիմնական վայրի անվանում',
  serviceAreas: 'Սպասարկվող տարածքներ',
  regionSlug: 'Մարզ',
  citySlug: 'Հիմնական քաղաք',
  districtSlug: 'Հիմնական շրջան',

  priceCityCallout: 'Քաղաքում կանչ (Դ)',
  pricePerKm: 'Միջքաղաքային (Դ/կմ)',
  priceWaitingPerHour: 'Սպասում (Դ/ժամ)',
  priceNightSurchargePercent: 'Գիշերային (+%)',
  priceExtraLoading: 'Բարդ բեռնում (+Դ)',

  imageIds: 'Նկարներ',
  latitude: 'Լայնություն',
  longitude: 'Երկայնություն',
}

export function profileFieldLabel(field: string): string {
  return PROFILE_FIELD_LABELS[field] ?? field
}

const EMPTY = '—'

/**
 * A stored value, as a sentence.
 *
 * Every branch below exists because the raw value is unreadable or actively
 * misleading on its own:
 *
 * - **booleans** — `true` next to «Ճախարակ» does not say whether that is the
 *   old value or the new one until it reads «Այո».
 * - **slug lists** — a moderator comparing coverage needs «Աբովյան, Հրազդան»,
 *   not `["abovyan","hrazdan"]`.
 * - **`imageIds`** — the ids mean nothing to anyone. What a moderator can act
 *   on is how many there are and that the order changed, so that is what is
 *   said; the photos themselves are on the truck's card in the same panel.
 * - **null/empty** — rendered as a dash, so «cleared» is visibly different from
 *   «unchanged» rather than being an empty cell.
 */
export function formatProfileValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY

  switch (field) {
    case 'vehicleType':
      return VEHICLE_TYPE_LABELS[value as VehicleType] ?? String(value)

    case 'capacityTons':
      return `${value} տ${capacityBandSuffix(Number(value))}`

    case 'winch':
    case 'manipulator':
    case 'wheelSkates':
    case 'doubleDeck':
    case 'towHitch':
    case 'heavyEquipment':
    case 'servesAllArmenia':
      return value ? 'Այո' : 'Ոչ'

    case 'services':
      return Array.isArray(value)
        ? value.map((slug) => SERVICE_LABELS[slug as ServiceType] ?? String(slug)).join(', ')
        : String(value)

    case 'serviceAreas':
      // The names travel with the areas (the backend stores them resolved, see
      // ServiceAreaDto), so this reads them rather than looking them up — a
      // moderator sees exactly the words the public profile shows.
      return Array.isArray(value)
        ? value
            .map((area) => (area as { name?: string; slug?: string }).name ?? String((area as { slug?: string }).slug))
            .join(', ')
        : String(value)

    case 'imageIds':
      return Array.isArray(value) ? `${value.length} նկար` : String(value)

    default:
      return String(value)
  }
}

/**
 * The band a capacity figure came from, when it maps onto one.
 *
 * The driver picks a band and the frontend converts it with
 * `representativeCapacityTons`, so «5 տ» in a diff is the stored consequence of
 * a choice that read «3-5 տոննա» on screen. Showing both means a moderator can
 * recognise the answer the driver actually gave.
 */
function capacityBandSuffix(tons: number): string {
  const band = CAPACITY_RANGE_OPTIONS.find(
    (option) => representativeCapacityTons(option.value) === tons,
  )
  return band ? ` (${band.label})` : ''
}
