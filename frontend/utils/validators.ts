export type ValidationRule = (value: string) => string | true

export const required =
  (message = 'Դաշտը պարտադիր է'): ValidationRule =>
  (value) =>
    value.trim().length > 0 || message

/** Exact shape only — +374 followed by 8 digits, no spaces/dashes (e.g. +37491000001) */
export const isPhone =
  (message = 'Մուտքագրեք հեռախոսահամարը այս ձևաչափով՝ +37491000001'): ValidationRule =>
  (value) => {
    if (!value.trim()) return true
    return /^\+374\d{8}$/.test(value.trim()) || message
  }

export const isEmail =
  (message = 'Մուտքագրեք վավեր email հասցե'): ValidationRule =>
  (value) => {
    if (!value.trim()) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) || message
  }

/**
 * One platform dimension in metres — a plain positive number, comma or dot.
 *
 * Replaced `isPlatformDimensions`, which validated a whole formatted string
 * (`"5.5 մ × 2.2 մ"`) because the field used to ask for one. Now that the UI
 * collects length and width as two number inputs
 * (`PlatformDimensionsInput.vue`), there is no format left to get wrong — only
 * a range. Empty passes: the dimensions are optional everywhere they're asked.
 */
export const isDimension =
  (message = 'Մուտքագրեք չափսը մետրերով, օր.՝ 5.5'): ValidationRule =>
  (value) => {
    if (!value.trim()) return true
    const parsed = Number(value.trim().replace(',', '.'))
    return (Number.isFinite(parsed) && parsed > 0 && parsed <= 30) || message
  }

/** Optional positive amount in AMD (digits only) */
export const isAmount =
  (message = 'Մուտքագրեք գումարը թվերով (օր.՝ 10000)'): ValidationRule =>
  (value) => {
    if (!value.trim()) return true
    return /^\d{3,7}$/.test(value.trim()) || message
  }

/** Optional percent 1–100 */
export const isPercent =
  (message = 'Մուտքագրեք տոկոսը 1-100 միջակայքում'): ValidationRule =>
  (value) => {
    if (!value.trim()) return true
    const percent = Number(value.trim())
    return (Number.isInteger(percent) && percent >= 1 && percent <= 100) || message
  }

export const isYear =
  (message = 'Մուտքագրեք վավեր տարեթիվ'): ValidationRule =>
  (value) => {
    if (!value.trim()) return true
    const year = Number(value)
    const currentYear = new Date().getFullYear()
    return (Number.isInteger(year) && year >= 1980 && year <= currentYear) || message
  }

/** Runs rules in order, returns the first error or null */
export function validateField(value: string, rules: ValidationRule[]): string | null {
  for (const rule of rules) {
    const result = rule(value)
    if (result !== true) return result
  }
  return null
}
