/**
 * Client-side checks for the sign-up form — the same rules as the server
 * (backend/src/live-dispatch/fleet/fleet-access.ts `parseRegistration`), so a
 * driver sees the problem on the field instead of after a round trip. The
 * server stays the authority. Pure, so it is unit-tested.
 *
 * Only flatbed / sliding-platform are offered at sign-up (product decision,
 * 2026-11) — `manipulator` and `heavy-duty` still exist as vehicle types
 * (backend/frontend `VEHICLE_TYPES`/`APP_VEHICLE_TYPES` are untouched, so that
 * sync point stays intact) but the picker only shows the two ordinary ones.
 * Capacity/crane are no longer asked either; DEFAULT_* below is what is sent
 * instead — dispatch's requirements-matching (backend/.../requirements.ts)
 * still reads these fields, so they must stay sane for an ordinary tow job.
 * There is no admin edit screen for them yet (drivers.vue is read-only), so
 * this is the value for the lifetime of the account until one exists.
 */
import { parseCoordinates } from './coordinates'
import { type VehicleType } from './vehicleTypes'

/** Offered at sign-up. `VEHICLE_TYPES` (vehicleTypes.ts) keeps the full set the server accepts. */
export const REGISTRATION_VEHICLE_TYPES = ['flatbed', 'sliding-platform'] as const

const DEFAULT_CAPACITY_TONS = 3
const DEFAULT_MAX_LOAD_TONS = null
const DEFAULT_MANIPULATOR = false

export interface RegistrationForm {
  phone: string
  password: string
  passwordRepeat: string
  driverName: string
  vehicleType: VehicleType | null
  wheelSkates: boolean
  vehicleDescription: string
  /**
   * Optional base (parking) location, "lat, lng". Used by dispatch only as a
   * fallback, when no driver with fresh GPS is found and this driver's app is
   * connected but his GPS is stale.
   */
  baseCoords: string
}

export type RegistrationField = Exclude<keyof RegistrationForm, 'wheelSkates'>

export interface RegistrationPayload {
  phone: string
  password: string
  driverName: string
  vehicleType: VehicleType
  capacityTons: number
  maxLoadTons: number | null
  manipulator: boolean
  wheelSkates: boolean
  vehicleDescription: string | null
  baseLatitude: number | null
  baseLongitude: number | null
}

export const EMPTY_REGISTRATION: RegistrationForm = {
  phone: '+374',
  password: '',
  passwordRepeat: '',
  driverName: '',
  vehicleType: null,
  wheelSkates: false,
  vehicleDescription: '',
  baseCoords: '',
}

/** "+374 91 00-00-01" → "+37491000001" */
export function normalisePhone(value: string): string {
  return value.replace(/[\s()-]/g, '')
}

export function validateRegistration(form: RegistrationForm): { ok: true; payload: RegistrationPayload } | { ok: false; errors: Partial<Record<RegistrationField, true>> } {
  const errors: Partial<Record<RegistrationField, true>> = {}
  const phone = normalisePhone(form.phone)
  if (!/^\+374\d{8}$/.test(phone)) errors.phone = true
  if (form.password.length < 8 || form.password.length > 72) errors.password = true
  if (form.passwordRepeat !== form.password) errors.passwordRepeat = true
  const driverName = form.driverName.trim().replace(/\s+/g, ' ')
  if (driverName.length < 2 || driverName.length > 80) errors.driverName = true
  if (!form.vehicleType || !(REGISTRATION_VEHICLE_TYPES as readonly string[]).includes(form.vehicleType)) errors.vehicleType = true
  const description = form.vehicleDescription.trim()
  if (description.length > 200) errors.vehicleDescription = true
  const base = form.baseCoords.trim() === '' ? null : parseCoordinates(form.baseCoords)
  if (form.baseCoords.trim() !== '' && base === null) errors.baseCoords = true
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    payload: {
      phone,
      password: form.password,
      driverName,
      vehicleType: form.vehicleType as VehicleType,
      capacityTons: DEFAULT_CAPACITY_TONS,
      maxLoadTons: DEFAULT_MAX_LOAD_TONS,
      manipulator: DEFAULT_MANIPULATOR,
      wheelSkates: form.wheelSkates,
      vehicleDescription: description === '' ? null : description,
      baseLatitude: base?.latitude ?? null,
      baseLongitude: base?.longitude ?? null,
    },
  }
}

/** Server error code → which message to show on the login screen */
export const LOGIN_ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'APP_ACCESS_NOT_GRANTED',
  'APP_ACCOUNT_PENDING',
  'APP_ACCOUNT_REJECTED',
  'APP_ACCESS_SUSPENDED',
] as const

export const REGISTER_ERROR_CODES = ['PHONE_BELONGS_TO_SITE_DRIVER', 'PHONE_ALREADY_REGISTERED', 'REGISTRATION_ALREADY_PENDING', 'VALIDATION_FAILED', 'RATE_LIMITED'] as const

export function loginErrorKey(status: number | null, code: string | null): string {
  if (status === null) return 'errors.NETWORK'
  if (code && (LOGIN_ERROR_CODES as readonly string[]).includes(code)) return `loginErrors.${code}`
  // The website's own refusals (DriverAuthService) carry no dispatch code
  if (status === 401) return 'loginErrors.INVALID_CREDENTIALS'
  if (status === 403) return 'login.deactivated'
  if (status === 429) return 'loginErrors.RATE_LIMITED'
  return 'errors.UNKNOWN'
}
