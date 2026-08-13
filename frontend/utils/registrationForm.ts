import { validateServiceAreaSelection } from '~/constants/serviceAreaLimits'
import { ServiceType, VehicleType } from '~/types/enums'
import { parseCoordinates, type Coordinates } from './coordinates'
import type { RegistrationFormState } from './registrationPayload'
import {
  isAmount,
  isDimension,
  isEmail,
  isPercent,
  isPhone,
  isYear,
  required,
  validateField,
} from './validators'

/**
 * The registration form, as data and as rules — with no page attached.
 *
 * ## Why this is not simply part of `pages/register.vue`
 *
 * The same form is now filled in twice by two different people. A driver fills
 * it in at `/register`; a moderator sees it again, pre-filled and editable, at
 * `/admin/registrations/:id`, and what they submit is what gets published (see
 * `RegistrationProfileDto` on the backend for the mirror of this).
 *
 * Everything those two pages must agree on lives here: the shape of the state,
 * its blank value, and every validation rule. `RegistrationFormFields.vue`
 * holds the third shared thing — the markup. What is left in each page is only
 * what genuinely differs: the driver uploads photos and gets a thank-you
 * dialog; the moderator gets a slug, a base picker, and Approve/Reject.
 *
 * A rule that lived in only one of the two pages would be the quiet kind of
 * bug: the admin form would accept a value the API then rejects with a message
 * written for a driver, or — worse — accept one it does not reject, and publish
 * a profile the public form would never have allowed.
 */

/**
 * A blank form.
 *
 * A factory, not a shared literal, because both callers mutate their copy:
 * `/register` resets it after a successful submission, and the review page
 * overwrites it from the loaded request. A module-level object would be the
 * same object in both tabs of a moderator's browser.
 */
export function createRegistrationFormState(): RegistrationFormState {
  return {
    firstName: '',
    lastName: '',
    companyName: '',
    // Pre-filled and locked to the +374 prefix (see `armenianPhoneInputValue`)
    // — the driver only ever types the 8 local digits.
    phone: '+374',
    secondaryPhone: '',
    whatsapp: '',
    telegram: '',
    email: '',
    brand: '',
    model: '',
    year: '',
    vehicleType: '',
    capacity: '',
    platformLengthM: '',
    platformWidthM: '',
    winch: false,
    manipulator: false,
    wheelSkates: false,
    workingHoursStart: '',
    workingHoursEnd: '',
    regionSlugs: [],
    citySlugs: [],
    /** Raw text from the single coordinates box — parsed on submit, never sent as a string */
    coordinates: '',
    services: [],
    priceCityCallout: '',
    pricePerKm: '',
    priceWaitingPerHour: '',
    priceNightSurchargePercent: '',
    priceExtraLoading: '',
  }
}

/**
 * A stored number back into the text an `<input>` holds.
 *
 * Empty for anything that is not a real answer: `null`, `undefined`, or a
 * **non-positive** number.
 *
 * ## Why zero counts as "not answered"
 *
 * Every optional numeric field on this form is validated as a positive value —
 * `isAmount` wants 3-7 digits, `isDimension` wants a length above zero — so a
 * form pre-filled with `0` refuses to submit, on a field that is not required,
 * with a message about a value the person never typed. That is what it did:
 * both the admin review page and the driver's own dashboard turned a stored `0`
 * into the string `"0"`, and the whole form became unsubmittable. A driver in
 * that state could not save their profile at all, and a moderator could not
 * approve the request.
 *
 * `0` is also not a price this platform can display. `toTowTruckApi` includes
 * any non-null value, so a stored zero renders «0 Դ» on the public profile —
 * which a customer reads as "free", not as "unknown". The honest reading of a
 * zero here is that nobody answered, so that is how it is shown, and the person
 * can type a real number if there is one.
 *
 * `null` alone was a bug of its own: `String(null)` is `"null"`, which a
 * `<input type="number">` silently renders as empty and then rejects on submit —
 * an error on a field that looks blank.
 */
export function numberFieldText(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : ''
}

/** Error keys this validator can set — one per field or field pair on the shared form */
export type RegistrationFormErrors = Record<string, string>

export interface RegistrationValidationResult {
  ok: boolean
  /**
   * The pair parsed from the coordinates box, or `null` when it was left empty.
   *
   * Returned rather than re-parsed at submit time so the string is read exactly
   * once: the same result that decided whether to show an error under the field
   * is the one that ends up in the payload, and there is no second parse that
   * could disagree with the first.
   *
   * Never null-because-unparseable — that case sets an error and `ok: false`.
   */
  coordinates: Coordinates | null
}

/**
 * Validates every field both forms share, writing messages into `errors`.
 *
 * Mutates the caller's reactive error object rather than returning a fresh one,
 * because each page owns extra keys this function knows nothing about (the
 * driver's `mainImage`, the moderator's `slug`) and replacing the object would
 * wipe them.
 *
 * `ok` reflects **only** the shared fields, so a caller that adds its own must
 * combine the two verdicts rather than trusting this one alone.
 */
export function validateRegistrationForm(
  form: RegistrationFormState,
  errors: RegistrationFormErrors,
): RegistrationValidationResult {
  errors.firstName = validateField(form.firstName, [required()]) ?? ''
  errors.lastName = validateField(form.lastName, [required()]) ?? ''
  errors.phone = validateField(form.phone, [required(), isPhone()]) ?? ''
  errors.secondaryPhone = validateField(form.secondaryPhone, [isPhone()]) ?? ''
  errors.whatsapp = validateField(form.whatsapp, [isPhone()]) ?? ''
  errors.email = validateField(form.email, [isEmail()]) ?? ''
  errors.brand = validateField(form.brand, [required()]) ?? ''
  errors.year = validateField(form.year, [required(), isYear()]) ?? ''
  errors.vehicleType = validateField(form.vehicleType, [required('Ընտրեք մեքենայի տեսակը')]) ?? ''
  errors.capacity =
    validateField(form.capacity, [required('Ընտրեք առավելագույն բեռնատարողությունը')]) ?? ''

  // Optional, but both-or-neither: half a size is not a size. Same rule the
  // working-hours pair uses.
  errors.platformDimensions =
    validateField(form.platformLengthM, [isDimension()]) ??
    validateField(form.platformWidthM, [isDimension()]) ??
    (Boolean(form.platformLengthM.trim()) !== Boolean(form.platformWidthM.trim())
      ? 'Լրացրեք և՛ երկարությունը, և՛ լայնությունը, կամ թողեք երկուսն էլ դատարկ'
      : '')

  errors.regionSlugs = form.regionSlugs.length === 0 ? 'Ընտրեք 1-2 մարզ' : ''
  errors.citySlugs = validateServiceAreaSelection(form.regionSlugs, form.citySlugs)
  errors.services = form.services.length === 0 ? 'Ընտրեք առնվազն մեկ ծառայություն' : ''

  // Optional: an empty box submits, and the driver adds it later from their
  // dashboard. Anything actually typed still has to parse — "half a
  // coordinate" is a mistake worth catching, "no coordinate" is a choice.
  //
  // This is the one field whose difficulty could cost the whole registration
  // (copying a value out of Google Maps, on a phone), which is why it gives way
  // rather than blocking. See RegistrationProfileDto for the same argument on
  // the API side.
  let coordinates: Coordinates | null = null
  if (form.coordinates.trim()) {
    const parsed = parseCoordinates(form.coordinates)
    coordinates = parsed.ok ? { latitude: parsed.latitude, longitude: parsed.longitude } : null
    errors.coordinates = parsed.ok ? '' : parsed.error
  } else {
    errors.coordinates = ''
  }

  // Fully optional — a driver may leave both 24/7 unselected and hours unset.
  // Only flag it when exactly one of the two times got filled in, since that
  // combination cannot be saved as a valid range either way.
  errors.workingHours =
    Boolean(form.workingHoursStart) !== Boolean(form.workingHoursEnd)
      ? 'Լրացրեք և՛ սկիզբը, և՛ ավարտը, կամ թողեք երկուսն էլ դատարկ'
      : ''

  errors.priceCityCallout = validateField(form.priceCityCallout, [isAmount()]) ?? ''
  errors.pricePerKm =
    validateField(form.pricePerKm, [isAmount('Մուտքագրեք 1 կմ-ի գինը թվերով (օր.՝ 300)')]) ?? ''
  errors.priceWaitingPerHour = validateField(form.priceWaitingPerHour, [isAmount()]) ?? ''
  errors.priceNightSurchargePercent =
    validateField(form.priceNightSurchargePercent, [isPercent()]) ?? ''
  errors.priceExtraLoading = validateField(form.priceExtraLoading, [isAmount()]) ?? ''

  return { ok: SHARED_ERROR_KEYS.every((key) => !errors[key]), coordinates }
}

/**
 * Exactly the keys `validateRegistrationForm` sets.
 *
 * The verdict is computed from this list rather than from `Object.values(errors)`
 * because the errors object belongs to the page and holds its own keys too — a
 * moderator's unfilled `slug` would otherwise make the shared fields report
 * themselves invalid, and the page could never say which half was wrong.
 */
const SHARED_ERROR_KEYS = [
  'firstName',
  'lastName',
  'phone',
  'secondaryPhone',
  'whatsapp',
  'email',
  'brand',
  'year',
  'vehicleType',
  'capacity',
  'platformDimensions',
  'regionSlugs',
  'citySlugs',
  'services',
  'coordinates',
  'workingHours',
  'priceCityCallout',
  'pricePerKm',
  'priceWaitingPerHour',
  'priceNightSurchargePercent',
  'priceExtraLoading',
] as const

/**
 * «Մանիպուլյատորով էվակուատոր» as a vehicle type already answers «Ունի
 * մանիպուլյատոր», so the checkbox is ticked and locked instead of being asked
 * again — on both forms, which is why the rule is here and not in a page.
 *
 * Before this, the two could disagree, and they did: a driver picked the type,
 * left the redundant box alone, and became invisible to the «Մանիպուլյատոր»
 * filter, which is precisely the customer looking for them.
 *
 * Only forced in one direction. Unticking is not re-enabled when the type
 * changes away, because a flatbed that also carries a crane is a real vehicle:
 * the driver's own `true` stays theirs to keep or clear.
 */
export function isManipulatorVehicleType(vehicleType: string): boolean {
  return vehicleType === VehicleType.Manipulator
}

/** Whether «24/7» is among the selected services — hides the working-hours pair */
export function isAvailable247(services: readonly string[]): boolean {
  return services.includes(ServiceType.Available247)
}
