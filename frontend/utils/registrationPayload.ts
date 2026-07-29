import type { RegistrationPayload } from '~/repositories'
import { ServiceType } from '~/types/enums'
import { formatWorkingHoursRange } from './workingHours'

/** Raw registration form state (strings come straight from the inputs) */
export interface RegistrationFormState {
  firstName: string
  lastName: string
  companyName: string
  phone: string
  secondaryPhone: string
  whatsapp: string
  telegram: string
  email: string
  brand: string
  model: string
  year: string
  vehicleType: string
  capacity: string
  /** Raw strings from the two number inputs — see PlatformDimensionsInput.vue */
  platformLengthM: string
  platformWidthM: string
  winch: boolean
  manipulator: boolean
  /** Wheel skates — for loading a vehicle with locked/non-rotating wheels */
  wheelSkates: boolean
  /** Only meaningful when the "available-24-7" service isn't selected — raw <input type="time"> values */
  workingHoursStart: string
  workingHoursEnd: string
  /** Up to 2 marzes */
  regionSlugs: string[]
  citySlugs: string[]
  services: string[]
  priceCityCallout: string
  pricePerKm: string
  priceWaitingPerHour: string
  priceNightSurchargePercent: string
  priceExtraLoading: string
}

const optionalString = (value: string): string | undefined => value.trim() || undefined

const optionalInt = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined
}

/**
 * Decimals, not rounded — and comma-tolerant, because an Armenian keyboard
 * layout puts `,` where JSON needs `.` and a driver typing "5,5" means 5.5.
 * `AppInput` lets both through for exactly this reason.
 */
export const toOptionalFloat = (value: string): number | undefined => {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Maps the validated form state to the backend CreateRegistrationDto shape */
export function buildRegistrationPayload(
  form: RegistrationFormState,
  imageIds: number[],
): RegistrationPayload {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    companyName: optionalString(form.companyName),
    phone: form.phone.trim(),
    secondaryPhone: optionalString(form.secondaryPhone),
    whatsapp: optionalString(form.whatsapp),
    telegram: optionalString(form.telegram),
    email: optionalString(form.email),
    vehicleBrand: form.brand.trim(),
    vehicleModel: optionalString(form.model),
    vehicleYear: Number(form.year),
    vehicleType: form.vehicleType,
    capacityRange: form.capacity.trim(),
    platformLengthM: toOptionalFloat(form.platformLengthM),
    platformWidthM: toOptionalFloat(form.platformWidthM),
    winch: form.winch,
    manipulator: form.manipulator,
    wheelSkates: form.wheelSkates,
    // Fully optional — only combine into a value when both sides are filled
    // in and 24/7 wasn't picked; otherwise leave it unset entirely rather
    // than send a half-formed range.
    workingHoursText:
      form.services.includes(ServiceType.Available247) ||
      !form.workingHoursStart ||
      !form.workingHoursEnd
        ? undefined
        : formatWorkingHoursRange(form.workingHoursStart, form.workingHoursEnd),
    regionSlugs: form.regionSlugs,
    citySlugs: form.citySlugs,
    services: form.services,
    priceCityCallout: optionalInt(form.priceCityCallout),
    pricePerKm: optionalInt(form.pricePerKm),
    priceWaitingPerHour: optionalInt(form.priceWaitingPerHour),
    priceNightSurchargePercent: optionalInt(form.priceNightSurchargePercent),
    priceExtraLoading: optionalInt(form.priceExtraLoading),
    imageIds,
  }
}
