export type ValidationRule = (value: string) => string | true

export const required =
  (message = 'Դաշտը պարտադիր է'): ValidationRule =>
  (value) =>
    value.trim().length > 0 || message

/** Exact shape only — +374 followed by 8 digits, no spaces/dashes (e.g. +37493632003) */
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

/** Accepts "5.5 x 2.2", "5,5 × 2,2", with or without "մ"/"m" units */
export const isPlatformDimensions =
  (message = 'Սխալ ձևաչափ․ լրացրեք այսպես՝ 5.5 մ × 2.2 մ'): ValidationRule =>
  (value) => {
    if (!value.trim()) return true
    return (
      /^\d{1,2}([.,]\d{1,2})?\s*(մ|m)?\s*[x×*]\s*\d{1,2}([.,]\d{1,2})?\s*(մ|m)?$/i.test(
        value.trim(),
      ) || message
    )
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
