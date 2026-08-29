import {
  hasUncappedCoverage,
  validateServiceAreaSelection,
} from '~/constants/serviceAreaLimits'
import { servicesAllowedFor } from '~/constants/services'
import {
  asksDoubleDeck,
  asksTowHitch,
  asksWheelSkates,
  specialistSpecFieldsFor,
  usesExactCapacity,
} from '~/constants/vehicles'
import { ServiceType, VehicleType } from '~/types/enums'
import { parseCoordinates, type Coordinates } from './coordinates'
import type { RegistrationFormState } from './registrationPayload'
import {
  isAmount,
  isDimension,
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
    brand: '',
    model: '',
    year: '',
    vehicleType: '',
    capacity: '',
    platformLengthM: '',
    platformWidthM: '',
    craneCapacityTons: '',
    craneReachM: '',
    maxLoadTons: '',
    platformLoadHeightCm: '',
    winch: false,
    manipulator: false,
    wheelSkates: false,
    doubleDeck: false,
    towHitch: false,
    heavyEquipment: false,
    servesAllArmenia: false,
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
  errors.brand = validateField(form.brand, [required()]) ?? ''
  errors.year = validateField(form.year, [required(), isYear()]) ?? ''
  errors.vehicleType = validateField(form.vehicleType, [required('Ընտրեք մեքենայի տեսակը')]) ?? ''

  // The capacity band and the exact tonnage are the SAME question asked two
  // ways, so exactly one of them is required — never both, never neither.
  // «Մանիպուլյատոր» and «Ծանր տեխնիկայի էվակուատոր» state a real figure
  // (`maxLoadTons`); everyone else picks a band. Requiring the band from a
  // specialist as well would be asking a driver to answer twice and then
  // storing the vaguer of the two answers.
  const exactCapacity = usesExactCapacity(form.vehicleType)
  errors.capacity = exactCapacity
    ? ''
    : validateField(form.capacity, [required('Ընտրեք առավելագույն բեռնատարողությունը')]) ?? ''

  validateSpecialistSpecs(form, errors)

  // Optional, but both-or-neither: half a size is not a size. Same rule the
  // working-hours pair uses.
  errors.platformDimensions =
    validateField(form.platformLengthM, [isDimension()]) ??
    validateField(form.platformWidthM, [isDimension()]) ??
    (Boolean(form.platformLengthM.trim()) !== Boolean(form.platformWidthM.trim())
      ? 'Լրացրեք և՛ երկարությունը, և՛ լայնությունը, կամ թողեք երկուսն էլ դատարկ'
      : '')

  // An uncapped driver may pick as many marzes as they work in, and one who
  // answered «Ամբողջ Հայաստան» has answered the question already — so the
  // "1-2 marzes" wording is wrong for both, and the region rule moves inside
  // `validateServiceAreaSelection`, which can see who is being asked.
  const coverage = {
    vehicleType: form.vehicleType,
    manipulator: form.manipulator,
    heavyEquipment: form.heavyEquipment,
    servesAllArmenia: form.servesAllArmenia,
  }
  const uncapped = hasUncappedCoverage(coverage)

  errors.regionSlugs =
    uncapped || form.regionSlugs.length > 0 ? '' : 'Ընտրեք 1-2 մարզ'
  errors.citySlugs = validateServiceAreaSelection(form.regionSlugs, form.citySlugs, coverage)
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
/**
 * The technical questions this vehicle type is actually shown.
 *
 * Only the visible ones are validated, and that is the whole rule: a driver
 * who typed a crane reach, then switched to «Հարթակով էվակուատոր», still has
 * the string on the state (deliberately — switching back must not lose it), but
 * an error on a field that is no longer on screen is an unsubmittable form with
 * no visible cause. `buildRegistrationPayload` sends whatever is there;
 * `AdminService.approve` writes it to a column nothing reads for that type.
 *
 * Errors are keyed by the field name, so `errors.craneReachM` lands under the
 * input that produced it without the component needing a mapping table.
 */
export function validateSpecialistSpecs(
  form: SpecialistSpecFields & { vehicleType: string },
  errors: RegistrationFormErrors,
): void {
  // Clear every key first: a field that stopped being shown must stop
  // reporting, and `SPECIALIST_SPEC_KEYS` is the closed list of what can.
  for (const key of SPECIALIST_SPEC_KEYS) errors[key] = ''

  for (const field of specialistSpecFieldsFor(form.vehicleType)) {
    const raw = form[field.key].trim()

    if (!raw) {
      if (field.required) errors[field.key] = `Լրացրեք՝ ${field.label}`
      continue
    }

    // Comma-tolerant for the same reason `toOptionalFloat` is: an Armenian
    // keyboard puts «,» where a number needs «.», and "5,5" means 5.5.
    const value = Number(raw.replace(',', '.'))
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      errors[field.key] = `Մուտքագրեք ${field.min}–${field.max} ${field.unit} միջակայքում`
    }
  }
}

/**
 * Every key `validateSpecialistSpecs` may set.
 *
 * Listed rather than derived from the currently-shown fields, because the
 * clearing pass has to reach a key belonging to the type the driver just
 * switched AWAY from — which is precisely the one no longer in that list.
 */
const SPECIALIST_SPEC_KEYS = [
  'craneCapacityTons',
  'craneReachM',
  'maxLoadTons',
  'platformLoadHeightCm',
] as const

/**
 * The four raw inputs, as a structural type rather than a slice of
 * `RegistrationFormState`.
 *
 * The driver dashboard keeps its own form object — it asks a different set of
 * questions (one `driverName` instead of two names, no phone, a description)
 * and always has. Typing these helpers structurally is what lets that page
 * reuse the exact same rules instead of growing a second copy of them, which is
 * the failure mode CLAUDE.md's registration/dashboard parity rule is about.
 */
export type SpecialistSpecFields = Record<(typeof SPECIALIST_SPEC_KEYS)[number], string>

const SHARED_ERROR_KEYS = [
  ...SPECIALIST_SPEC_KEYS,
  'firstName',
  'lastName',
  'phone',
  'secondaryPhone',
  'whatsapp',
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

/**
 * Puts the form back into a state that matches the vehicle just chosen.
 *
 * Changing the vehicle type changes which questions exist, and every answer to
 * a question that no longer exists is a hazard rather than a saving: it is
 * invisible, so nobody can correct it, and it still reaches the public profile.
 * Concretely, without this:
 *
 * - a flatbed that ticked «անվադողի փոխարինում» and then became a manipulator
 *   would advertise roadside repair from a crane truck, with no checkbox
 *   anywhere to untick;
 * - a driver who chose «Ամբողջ Հայաստան» and then went back to «Հարթակով
 *   էվակուատոր» would keep nationwide coverage the capped form cannot show
 *   them, and the API would reject the save with a message about a field they
 *   cannot see.
 *
 * Called from a watcher on both forms rather than from the pickers, so it runs
 * once per change wherever the change came from — including the admin review
 * page, where the person changing the type is not the person who answered.
 *
 * Widening only where the existing code widens: picking the manipulator TYPE
 * ticks «Ունի մանիպուլյատոր» and picking `heavy-duty` ticks «Ծանր տեխնիկայի
 * տեղափոխում», but changing away unticks neither — a flatbed with a crane, or
 * one that really does carry machinery, is a real vehicle and that `true` is
 * the driver's own answer to keep.
 */
export function syncVehicleDependentFields<TService extends string>(
  form: SpecialistSpecFields & {
    vehicleType: string
    manipulator: boolean
    heavyEquipment: boolean
    wheelSkates: boolean
    doubleDeck: boolean
    towHitch: boolean
    servesAllArmenia: boolean
    services: TService[]
    capacity: string
  },
): void {
  if (isManipulatorVehicleType(form.vehicleType)) form.manipulator = true
  if (form.vehicleType === VehicleType.HeavyDuty) form.heavyEquipment = true

  // The cast is safe by construction: `servicesAllowedFor` only ever FILTERS
  // the array it is given, so every surviving element is one TypeScript already
  // proved is a `TService`. It exists because the dashboard types this field as
  // `ServiceType[]` and the registration form as `string[]`.
  form.services = servicesAllowedFor(form.vehicleType, form.services) as TService[]

  // Same reasoning as the services above: an answer whose question is gone is
  // invisible, uncorrectable, and still reaches the public profile. A crane
  // truck advertising wheel skates is equipment it does not carry.
  if (!asksWheelSkates(form.vehicleType)) form.wheelSkates = false

  // Same rule, its own predicate — see `asksDoubleDeck` for why the two are
  // not one function even though they currently exclude the same types. A
  // crane truck advertising a second car deck is a platform it does not have.
  if (!asksDoubleDeck(form.vehicleType)) form.doubleDeck = false

  // Same rule, own predicate — see `asksTowHitch` for why it is not just
  // `asksDoubleDeck` reused, even though they agree on every type today.
  if (!asksTowHitch(form.vehicleType)) form.towHitch = false

  if (!hasUncappedCoverage(form)) form.servesAllArmenia = false

  // The band and the exact figure are one question (see `usesExactCapacity`).
  // Whichever is not being asked is cleared, so a stale answer can never be the
  // one that gets submitted — `buildRegistrationPayload` reads both.
  if (usesExactCapacity(form.vehicleType)) {
    form.capacity = ''
  } else {
    form.craneCapacityTons = ''
    form.craneReachM = ''
    form.maxLoadTons = ''
    form.platformLoadHeightCm = ''
  }
}
