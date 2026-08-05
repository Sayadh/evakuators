/** Keeps only digits and leading + */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

const AM_COUNTRY_CODE = '374'
const AM_LOCAL_DIGITS = 8

/**
 * Locks Armenian phone inputs to the exact `+374XXXXXXXX` shape (no spaces,
 * no dashes) — used as a v-model transform so the `+374` prefix can never be
 * edited away and stray characters (letters, symbols) can never sneak in.
 * Reconstructs the value from scratch on every keystroke: strips everything
 * but digits, drops a redundant leading "374" (e.g. if the user retypes it
 * after the fixed prefix), strips any leading zero(s) right after that (local
 * numbers never start with 0 once the country code is already present — that
 * 0 is the domestic trunk prefix people sometimes retype by habit, e.g.
 * "091234567" instead of "91234567"), caps the rest at 8 digits, and only
 * re-adds "+374" once at least one real digit has been typed — an untouched
 * optional field stays empty rather than being stuck showing a lone "+374".
 */
export function armenianPhoneInputValue(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith(AM_COUNTRY_CODE)) digits = digits.slice(AM_COUNTRY_CODE.length)
  digits = digits.replace(/^0+/, '')
  digits = digits.slice(0, AM_LOCAL_DIGITS)
  return digits ? `+${AM_COUNTRY_CODE}${digits}` : ''
}

/** "+374 91 00 00 01" → "tel:+37491000001" */
export function getPhoneHref(phone: string): string {
  return `tel:${normalizePhone(phone)}`
}

/** "+374 91 00 00 01" → "https://wa.me/37491000001" */
export function getWhatsAppUrl(phone: string): string {
  return `https://wa.me/${normalizePhone(phone).replace('+', '')}`
}

/** "username" → "https://t.me/username" — for a driver's own @handle */
export function getTelegramUrl(username: string): string {
  return `https://t.me/${username.replace(/^@/, '')}`
}

/**
 * "+374 77 13 54 66" → "https://t.me/+37477135466"
 *
 * Separate from `getTelegramUrl` on purpose. Telegram treats a path starting
 * with `+` as a phone number and anything else as a username, so the leading
 * `+` is load-bearing here and must survive — while `getTelegramUrl` strips a
 * leading `@` for the opposite reason. Drivers give us a handle; the platform
 * publishes a number. Folding both into one function would mean guessing which
 * kind of string it was handed.
 */
export function getTelegramPhoneUrl(phone: string): string {
  return `https://t.me/${normalizePhone(phone)}`
}

/** Groups a raw phone into a readable format if needed */
export function formatPhone(phone: string): string {
  return phone.trim()
}
