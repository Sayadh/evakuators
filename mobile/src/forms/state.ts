/**
 * The registration form's state and its two side effects, without Vue.
 *
 * The STATE, the blank value and every rule are the website's own
 * (`~/utils/registrationForm`, `~/utils/registrationPayload`); what this file
 * adds is what `RegistrationFormFields.vue` does with watchers:
 *
 * - changing the vehicle type (or the manipulator / heavy-equipment answers)
 *   runs `syncVehicleDependentFields`, so no answer to a question that no
 *   longer exists survives — the reasons are on that function;
 * - picking «24/7» clears the working hours.
 *
 * `applyChange` is pure (unit-tested): the form never reaches a state the
 * website's form could not.
 */
import { ServiceType } from '~/types/enums'
import { isAvailable247, syncVehicleDependentFields } from '~/utils/registrationForm'
import type { RegistrationFormState } from '~/utils/registrationPayload'
import { armenianPhoneInputValue } from '~/utils/formatPhone'

export type { RegistrationFormState }
export type FormErrors = Record<string, string>

const VEHICLE_KEYS = new Set(['vehicleType', 'manipulator', 'heavyEquipment'])
const PHONE_KEYS = new Set(['phone', 'secondaryPhone', 'whatsapp'])

export function applyChange<F extends RegistrationFormState>(form: F, patch: Partial<F>): F {
  const next = { ...form, ...patch, services: [...(patch.services ?? form.services)] } as F
  // The +374 prefix is fixed and only the 8 local digits are typed — the
  // website's `armenianPhoneInputValue`, the same model as its inputs.
  for (const key of Object.keys(patch)) {
    if (PHONE_KEYS.has(key)) (next as Record<string, unknown>)[key] = armenianPhoneInputValue(String((patch as Record<string, unknown>)[key] ?? ''))
  }
  if (Object.keys(patch).some((key) => VEHICLE_KEYS.has(key))) syncVehicleDependentFields(next)
  if (isAvailable247(next.services) && !isAvailable247(form.services)) {
    next.workingHoursStart = ''
    next.workingHoursEnd = ''
  }
  return next
}

export const INVOICE_SERVICE = ServiceType.InvoiceProvided
