/**
 * Combines two <input type="time"> values (native "HH:MM" strings) into the
 * single format the backend expects and validates — see
 * WORKING_HOURS_PATTERN in the backend's create-registration.dto.ts.
 * Shared between register.vue and dashboard.vue so the two forms can never
 * drift into producing slightly different formats.
 */
export function formatWorkingHoursRange(start: string, end: string): string {
  return `${start} – ${end}`
}

/** Reverse of the above — used to prefill the two time inputs when editing
 * an existing profile. Returns nulls if the stored value doesn't match the
 * expected shape (defensive — shouldn't happen with backend validation in
 * place, but better than silently mis-splitting). */
export function splitWorkingHoursRange(value: string | undefined): {
  start: string
  end: string
} {
  const match = value?.match(/^(\d{2}:\d{2})\s[–-]\s(\d{2}:\d{2})$/)
  return match ? { start: match[1], end: match[2] } : { start: '', end: '' }
}
