/**
 * The sign-up, split into steps a driver can finish on a phone. Which error
 * keys of the website's validator belong to which step — so "Next" only
 * stops on the questions actually on screen, and the final check can send the
 * driver straight to the step that still has a problem. Pure (unit-tested).
 */
import type { FormErrors } from '../forms/state'

export const STEPS = ['account', 'contacts', 'vehicle', 'coverage', 'services', 'location', 'prices', 'photos', 'review'] as const
export type StepName = (typeof STEPS)[number]

const STEP_ERRORS: Record<StepName, readonly string[]> = {
  account: ['firstName', 'lastName', 'phone', 'password', 'passwordRepeat'],
  contacts: ['secondaryPhone', 'whatsapp'],
  vehicle: ['brand', 'year', 'vehicleType', 'capacity', 'platformDimensions', 'craneCapacityTons', 'craneReachM', 'maxLoadTons', 'platformLoadHeightCm'],
  coverage: ['regionSlugs', 'citySlugs'],
  services: ['services', 'workingHours'],
  location: ['coordinates'],
  prices: ['priceCityCallout', 'pricePerKm', 'priceWaitingPerHour', 'priceNightSurchargePercent', 'priceExtraLoading'],
  photos: ['photos'],
  review: ['consent'],
}

export function stepHasErrors(step: StepName, errors: FormErrors): boolean {
  return STEP_ERRORS[step].some((key) => Boolean(errors[key]))
}

/** The first step with a problem, or null */
export function firstStepWithErrors(errors: FormErrors): number | null {
  const index = STEPS.findIndex((step) => stepHasErrors(step, errors))
  return index === -1 ? null : index
}

/** Only the errors of one step — what the screen shows */
export function errorsOf(step: StepName, errors: FormErrors): FormErrors {
  return Object.fromEntries(STEP_ERRORS[step].map((key) => [key, errors[key] ?? '']))
}

/** The app's own two account rules (the website asks for no password) — same bounds as the server */
export function passwordErrors(password: string, repeat: string, messages: { tooShort: string; mismatch: string }): FormErrors {
  return {
    password: password.length < 8 || password.length > 72 ? messages.tooShort : '',
    passwordRepeat: repeat !== password ? messages.mismatch : '',
  }
}
