/** "930" → "09:30", "1745" → "17:45" — the value <input type="time"> hands the website */
export function timeMask(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  const padded = digits.length === 3 ? `0${digits}` : digits
  const hours = Math.min(Number(padded.slice(0, 2)), 23)
  const minutes = Math.min(Number(padded.slice(2, 4)), 59)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
