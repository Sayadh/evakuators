import { PRIVACY_POLICY_VERSION } from '~/constants/privacyConsent'
import { capacityRangeFromTons, usesExactCapacity } from '~/constants/vehicles'
import type { RegistrationPayload } from '~/repositories'
import { ServiceType } from '~/types/enums'
import type { Coordinates } from './coordinates'
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
  brand: string
  model: string
  year: string
  vehicleType: string
  capacity: string
  /** Raw strings from the two number inputs — see PlatformDimensionsInput.vue */
  platformLengthM: string
  platformWidthM: string
  /**
   * The specialist technical answers, as raw input strings like everything else
   * on this object. Which of them a driver is actually shown comes from
   * `specialistSpecFieldsFor(vehicleType)`; the state carries all four
   * unconditionally so switching vehicle type back and forth does not destroy
   * a value the driver already typed.
   */
  craneCapacityTons: string
  craneReachM: string
  maxLoadTons: string
  platformLoadHeightCm: string
  winch: boolean
  manipulator: boolean
  /** Wheel skates — for loading a vehicle with locked/non-rotating wheels */
  wheelSkates: boolean
  /** «Ծանր տեխնիկայի տեղափոխում» — a claim the moderator confirms, see the DTO */
  heavyEquipment: boolean
  /**
   * «Ամբողջ Հայաստան» instead of a list of places.
   *
   * Only offered to a driver `hasUncappedCoverage()` is true for. Kept on the
   * state for everyone so the field has one shape, and forced back to `false`
   * by the form the moment the driver stops qualifying — an invisible `true`
   * would publish nationwide coverage nobody can see to untick.
   */
  servesAllArmenia: boolean
  /** Only meaningful when the "available-24-7" service isn't selected — raw <input type="time"> values */
  workingHoursStart: string
  workingHoursEnd: string
  /** Up to 2 marzes */
  regionSlugs: string[]
  citySlugs: string[]
  services: string[]
  /**
   * Raw text from the single coordinates box, exactly as pasted — e.g.
   * `"40.1792, 44.4991"`.
   *
   * Kept as the typed string here like every other field on this state object,
   * and never sent in this shape: `buildRegistrationPayload` takes the parsed
   * pair as its own argument instead (see below).
   */
  coordinates: string
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

/**
 * Maps the validated form state to the backend CreateRegistrationDto shape.
 *
 * `coordinates` arrives already parsed rather than as the raw string on
 * `form.coordinates`, because parsing can fail and this function has nowhere
 * honest to put a failure. The page's `validate()` has to parse anyway in order
 * to show the error under the field, so it passes the result it already has —
 * one parse, one place that can report a problem.
 *
 * `null` means the driver left the box empty, which is allowed: both keys are
 * then omitted from the payload entirely rather than sent as null, so the
 * request says "no location given" the same way every other optional field
 * does. Never null-because-unparseable — that case fails validation and never
 * reaches here.
 *
 * ## The consent fields are hard-coded, and that is correct
 *
 * `privacyConsentAccepted: true` is not read from the form, because there is no
 * form field for it: the only caller is `onConsentConfirmed`, which runs
 * exclusively after the driver ticked the box in the dialog. Threading a
 * boolean through would suggest there is a path where this is built with
 * `false`, and there is not — such a payload would be rejected by the API
 * (`@Equals(true)`) and should never be constructed in the first place.
 *
 * The version is the frontend's constant, and the server checks it against its
 * own. A tab open across a deploy sends the old one and is told to reload,
 * which is exactly the intended outcome — see `AcceptPrivacyConsentDto`.
 */
export function buildRegistrationPayload(
  form: RegistrationFormState,
  imageIds: number[],
  coordinates: Coordinates | null,
): RegistrationPayload {
  return {
    privacyConsentAccepted: true,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    companyName: optionalString(form.companyName),
    phone: form.phone.trim(),
    secondaryPhone: optionalString(form.secondaryPhone),
    whatsapp: optionalString(form.whatsapp),
    telegram: optionalString(form.telegram),
    vehicleBrand: form.brand.trim(),
    vehicleModel: optionalString(form.model),
    vehicleYear: Number(form.year),
    vehicleType: form.vehicleType,
    // A specialist states an exact tonnage instead of picking a band, but
    // `capacityRange` is a required column on the moderation queue and the
    // dashboard shows a band back to every driver — so the band is DERIVED from
    // the figure rather than asked for a second time. Same predicate the public
    // capacity filter uses (`matchesCapacityRange`), so the band a specialist
    // lands in is the band a customer would find them under.
    capacityRange: usesExactCapacity(form.vehicleType)
      ? capacityRangeFromTons(toOptionalFloat(form.maxLoadTons))
      : form.capacity.trim(),
    platformLengthM: toOptionalFloat(form.platformLengthM),
    platformWidthM: toOptionalFloat(form.platformWidthM),
    // Undefined when blank, never 0 — `toOptionalFloat` already does that, and
    // it matters here for the same reason it matters for the prices: the public
    // profile prints any value it is given, and «Կռունկի թև՝ 0 մ» is a
    // specification nobody stated.
    craneCapacityTons: toOptionalFloat(form.craneCapacityTons),
    craneReachM: toOptionalFloat(form.craneReachM),
    maxLoadTons: toOptionalFloat(form.maxLoadTons),
    platformLoadHeightCm: toOptionalFloat(form.platformLoadHeightCm),
    winch: form.winch,
    manipulator: form.manipulator,
    wheelSkates: form.wheelSkates,
    heavyEquipment: form.heavyEquipment,
    servesAllArmenia: form.servesAllArmenia,
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
    // Spread, not `latitude: coordinates?.latitude` — an explicit `undefined`
    // key still serialises differently from an absent one through some clients,
    // and the backend's `forbidNonWhitelisted` DTO is happiest with the key
    // simply not being there. Both or neither, which is also the rule the API
    // enforces (see RegistrationService).
    ...(coordinates
      ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
      : {}),
    priceCityCallout: optionalInt(form.priceCityCallout),
    pricePerKm: optionalInt(form.pricePerKm),
    priceWaitingPerHour: optionalInt(form.priceWaitingPerHour),
    priceNightSurchargePercent: optionalInt(form.priceNightSurchargePercent),
    priceExtraLoading: optionalInt(form.priceExtraLoading),
    imageIds,
  }
}
