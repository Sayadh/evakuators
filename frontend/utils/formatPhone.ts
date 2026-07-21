/** Keeps only digits and leading + */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

/** "+374 91 00 00 01" → "tel:+37491000001" */
export function getPhoneHref(phone: string): string {
  return `tel:${normalizePhone(phone)}`
}

/** "+374 91 00 00 01" → "https://wa.me/37491000001" */
export function getWhatsAppUrl(phone: string): string {
  return `https://wa.me/${normalizePhone(phone).replace('+', '')}`
}

/** "username" → "https://t.me/username" */
export function getTelegramUrl(username: string): string {
  return `https://t.me/${username.replace(/^@/, '')}`
}

/** Groups a raw phone into a readable format if needed */
export function formatPhone(phone: string): string {
  return phone.trim()
}
