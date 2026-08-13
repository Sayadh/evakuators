import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createRegistrationFormState,
  numberFieldText,
  validateRegistrationForm,
} from '~/utils/registrationForm'

/**
 * The registration form is filled in by two different people, on two different
 * pages, and both submissions become the same profile:
 *
 * - a driver at `/register` → `POST /registration-requests`
 * - a moderator at `/admin/registrations/:id` → the approval, whose body IS
 *   the published profile (see `ApproveRegistrationDto`)
 *
 * They must therefore ask the same questions with the same rules. A question
 * missing from the admin copy is an answer silently dropped at the moment a
 * profile goes live; one missing from the public copy is a question the driver
 * never got to answer. Both failures are quiet — nothing errors, a value just
 * is not there.
 *
 * Nothing about that parity is enforced by the type system, so it is enforced
 * here: one component, one state factory, one validator, used by both.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

const registerPage = read('pages/register.vue')
const reviewPage = read('pages/admin/registrations/[id].vue')
const fields = read('components/registration/RegistrationFormFields.vue')

describe('both forms render the same component', () => {
  it('/register uses RegistrationFormFields', () => {
    expect(registerPage).toContain('<RegistrationFormFields')
  })

  it('the review page uses RegistrationFormFields', () => {
    expect(reviewPage).toContain('<RegistrationFormFields')
  })

  it('neither page re-declares a field the component owns', () => {
    // The failure this guards against is a well-meant one: someone adds a field
    // to the page that renders the component, rather than to the component, and
    // the other page silently never gets it. Checked on a representative
    // sample — a field from each fieldset.
    for (const page of [registerPage, reviewPage]) {
      expect(page).not.toContain('v-model="form.firstName"')
      expect(page).not.toContain('v-model="form.vehicleType"')
      expect(page).not.toContain('v-model="form.services"')
      expect(page).not.toContain('v-model="form.pricePerKm"')
      expect(page).not.toContain('v-model:regions="form.regionSlugs"')
    }
  })

  it('both pages start from the same blank state', () => {
    expect(registerPage).toContain('createRegistrationFormState()')
    expect(reviewPage).toContain('createRegistrationFormState()')
  })

  it('both pages run the same validator', () => {
    expect(registerPage).toContain('validateRegistrationForm(form, errors)')
    expect(reviewPage).toContain('validateRegistrationForm(form, errors)')
  })

  it('both pages build their payload with the same builder', () => {
    // One mapper, so a field cannot be sent one way for a driver and another
    // way for an admin — which is how `capacityRange` and `workingHoursText`
    // would drift first, both being derived rather than copied.
    expect(registerPage).toContain('buildRegistrationPayload(')
    expect(reviewPage).toContain('buildRegistrationPayload(')
  })
})

describe('the shared component asks every question', () => {
  // Rendering is not testable here (docs/testing.md — no component runtime), so
  // this asserts the binding exists in the markup. Each entry is a field that
  // reaches the database, so a missing one is a lost answer, not a cosmetic gap.
  const bound = [
    'model.firstName',
    'model.lastName',
    'model.companyName',
    'model.telegram',
    'model.email',
    'model.brand',
    'model.model',
    'model.year',
    'model.vehicleType',
    'model.capacity',
    'model.platformLengthM',
    'model.platformWidthM',
    'model.winch',
    'model.manipulator',
    'model.wheelSkates',
    'model.regionSlugs',
    'model.citySlugs',
    'model.coordinates',
    'model.services',
    'model.workingHoursStart',
    'model.workingHoursEnd',
    'model.priceCityCallout',
    'model.pricePerKm',
    'model.priceWaitingPerHour',
    'model.priceNightSurchargePercent',
    'model.priceExtraLoading',
  ]

  it.each(bound)('binds %s', (path) => {
    expect(fields).toContain(path)
  })

  it('routes the three phone fields through the +374 wrapper', () => {
    // Bound via computed wrappers rather than directly, so the prefix stays
    // locked — a direct v-model would let anything be typed and the API would
    // reject it with a message about a format the person never chose.
    for (const wrapper of ['phoneModel', 'secondaryPhoneModel', 'whatsappModel']) {
      expect(fields).toContain(`v-model="${wrapper}"`)
    }
  })
})

describe('an optional number that was never answered', () => {
  // The bug: both forms pre-filled these with `String(value)`, so a stored 0
  // became "0" and a stored null became "null". Every optional numeric field
  // here is validated as a POSITIVE value — `isAmount` wants 3-7 digits — so
  // the form then refused to submit, on fields nobody had filled in, with an
  // error about a value nobody had typed.
  //
  // It blocked both sides: a moderator could not approve the request, and a
  // driver whose stored price was 0 could never save their profile at all.

  it('renders as an empty box', () => {
    expect(numberFieldText(null)).toBe('')
    expect(numberFieldText(undefined)).toBe('')
    expect(numberFieldText(0)).toBe('')
  })

  it('renders a real answer unchanged', () => {
    expect(numberFieldText(7000)).toBe('7000')
    expect(numberFieldText(5.5)).toBe('5.5')
  })

  it('refuses a negative or non-finite number, which is not an answer either', () => {
    expect(numberFieldText(-100)).toBe('')
    expect(numberFieldText(Number.NaN)).toBe('')
  })

  it('leaves the form submittable, which is the whole point', () => {
    // The end-to-end property. A form pre-filled from a request whose optional
    // numbers are all unset must validate.
    const errors: Record<string, string> = {}
    const form = {
      ...createRegistrationFormState(),
      firstName: 'Աշոտ',
      lastName: 'Աշոտյան',
      phone: '+37491000001',
      brand: 'Isuzu',
      year: '2018',
      vehicleType: 'flatbed',
      capacity: 'up-to-3',
      regionSlugs: ['kotayk'],
      citySlugs: ['abovyan'],
      services: ['towing'],
      // Exactly what the pages now produce for an unanswered 0/null.
      priceCityCallout: numberFieldText(0),
      pricePerKm: numberFieldText(null),
      priceWaitingPerHour: numberFieldText(0),
      priceNightSurchargePercent: numberFieldText(0),
      priceExtraLoading: numberFieldText(0),
      platformLengthM: numberFieldText(0),
      platformWidthM: numberFieldText(null),
    }

    expect(validateRegistrationForm(form, errors).ok).toBe(true)
  })
})

describe('the shared validator', () => {
  const blank = createRegistrationFormState()

  it('rejects a blank form', () => {
    const errors: Record<string, string> = {}
    expect(validateRegistrationForm(blank, errors).ok).toBe(false)
    expect(errors.firstName).toBeTruthy()
    expect(errors.services).toBeTruthy()
  })

  it('treats an empty coordinates box as "no location", not as an error', () => {
    // The one field allowed to defeat someone: it asks for a value copied out
    // of Google Maps on a phone. A blank submits and is added later from the
    // dashboard; only something actually typed has to parse.
    const errors: Record<string, string> = {}
    const result = validateRegistrationForm({ ...blank, coordinates: '' }, errors)
    expect(errors.coordinates).toBe('')
    expect(result.coordinates).toBeNull()
  })

  it('parses a filled coordinates box exactly once and hands the pair back', () => {
    const errors: Record<string, string> = {}
    const result = validateRegistrationForm({ ...blank, coordinates: '40.1792, 44.4991' }, errors)
    expect(errors.coordinates).toBe('')
    expect(result.coordinates).toEqual({ latitude: 40.1792, longitude: 44.4991 })
  })

  it('rejects half a working-hours range', () => {
    const errors: Record<string, string> = {}
    validateRegistrationForm({ ...blank, workingHoursStart: '09:00' }, errors)
    expect(errors.workingHours).toBeTruthy()
  })

  it('rejects half a platform size', () => {
    const errors: Record<string, string> = {}
    validateRegistrationForm({ ...blank, platformLengthM: '5' }, errors)
    expect(errors.platformDimensions).toBeTruthy()
  })

  it('ignores error keys it does not own when deciding ok', () => {
    // The review page keeps `slug` and `primarySlug` in the same errors object.
    // A verdict computed from Object.values(errors) would let an unfilled slug
    // report the shared half as invalid, and the page could never say which
    // half was actually wrong.
    const errors: Record<string, string> = { slug: 'Slug-ը սխալ է' }
    const filled = {
      ...blank,
      firstName: 'Աշոտ',
      lastName: 'Աշոտյան',
      phone: '+37491000001',
      brand: 'Isuzu',
      year: '2018',
      vehicleType: 'flatbed',
      capacity: 'up-to-3',
      regionSlugs: ['kotayk'],
      citySlugs: ['abovyan'],
      services: ['towing'],
    }
    expect(validateRegistrationForm(filled, errors).ok).toBe(true)
  })
})
