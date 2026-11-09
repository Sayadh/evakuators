/**
 * Client-side checks for the sign-up form — the same rules as the server
 * (backend/src/live-dispatch/fleet/fleet-access.ts `parseRegistration`), so a
 * driver sees the problem on the field instead of after a round trip. The
 * server stays the authority. Pure, so it is unit-tested.
 */
import { VEHICLE_TYPES, type VehicleType } from './vehicleTypes'

export interface RegistrationForm {
  phone: string
  password: string
  passwordRepeat: string
  driverName: string
  vehicleType: VehicleType | null
  capacityTons: string
  maxLoadTons: string
  manipulator: boolean
  wheelSkates: boolean
  vehicleDescription: string
}

export type RegistrationField = Exclude<keyof RegistrationForm, 'manipulator' | 'wheelSkates'>

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
}

export const EMPTY_REGISTRATION: RegistrationForm = {
  phone: '+374',
  password: '',
  passwordRepeat: '',
  driverName: '',
  vehicleType: null,
  capacityTons: '',
  maxLoadTons: '',
  manipulator: false,
  wheelSkates: false,
  vehicleDescription: '',
}

/** "+374 91 00-00-01" → "+37491000001" */
export function normalisePhone(value: string): string {
  return value.replace(/[\s()-]/g, '')
}

function parseTons(value: string): number | null {
  const n = Number(value.replace(',', '.').trim())
  return Number.isFinite(n) && n >= 0.5 && n <= 80 ? Math.round(n * 10) / 10 : null
}

export function validateRegistration(form: RegistrationForm): { ok: true; payload: RegistrationPayload } | { ok: false; errors: Partial<Record<RegistrationField, true>> } {
  const errors: Partial<Record<RegistrationField, true>> = {}
  const phone = normalisePhone(form.phone)
  if (!/^\+374\d{8}$/.test(phone)) errors.phone = true
  if (form.password.length < 8 || form.password.length > 72) errors.password = true
  if (form.passwordRepeat !== form.password) errors.passwordRepeat = true
  const driverName = form.driverName.trim().replace(/\s+/g, ' ')
  if (driverName.length < 2 || driverName.length > 80) errors.driverName = true
  if (!form.vehicleType || !(VEHICLE_TYPES as readonly string[]).includes(form.vehicleType)) errors.vehicleType = true
  const capacityTons = parseTons(form.capacityTons)
  if (capacityTons === null) errors.capacityTons = true
  const maxLoadTons = form.maxLoadTons.trim() === '' ? null : parseTons(form.maxLoadTons)
  if (form.maxLoadTons.trim() !== '' && maxLoadTons === null) errors.maxLoadTons = true
  const description = form.vehicleDescription.trim()
  if (description.length > 200) errors.vehicleDescription = true
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    payload: {
      phone,
      password: form.password,
      driverName,
      vehicleType: form.vehicleType as VehicleType,
      capacityTons: capacityTons as number,
      maxLoadTons,
      manipulator: form.manipulator,
      wheelSkates: form.wheelSkates,
      vehicleDescription: description === '' ? null : description,
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
