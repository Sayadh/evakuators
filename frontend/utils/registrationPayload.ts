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
  platformDimensions: string
  winch: boolean
  manipulator: boolean
  /** Only meaningful when the "available-24-7" service isn't selected — raw <input type="time"> values */
  workingHoursStart: string
  workingHoursEnd: string
  mainRegionSlug: string
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
    platformDimensions: optionalString(form.platformDimensions),
    winch: form.winch,
    manipulator: form.manipulator,
    // Fully optional — only combine into a value when both sides are filled
    // in and 24/7 wasn't picked; otherwise leave it unset entirely rather
    // than send a half-formed range.
    workingHoursText:
      form.services.includes(ServiceType.Available247) ||
      !form.workingHoursStart ||
      !form.workingHoursEnd
        ? undefined
        : formatWorkingHoursRange(form.workingHoursStart, form.workingHoursEnd),
    mainRegionSlug: form.mainRegionSlug,
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
