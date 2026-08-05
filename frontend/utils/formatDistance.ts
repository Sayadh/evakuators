/**
 * How a distance and a travel time are written on the /evakuator page.
 *
 * Pure functions over numbers, no Nuxt context — so the wording lives in one
 * place and is unit-testable, the same way `formatPrice` and `formatCapacity`
 * already are.
 */

/**
 * `4123` → `"4.1 կմ"`, `840` → `"840 մ"`.
 *
 * Metres below a kilometre, rounded to 10 m: the input is a road distance from a
 * driver's *stated parking spot*, so single-metre precision would be claiming
 * an accuracy the underlying data does not have.
 *
 * One decimal above a kilometre, and none past 10 km — «12 կմ» is what a person
 * says, «12.3 կմ» is what a machine says, and past that range the extra digit
 * is noise next to traffic.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''

  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10)
    return `${rounded} մ`
  }

  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1)} կմ` : `${Math.round(km)} կմ`
}

/**
 * `480` → `"8 րոպե"`, `5400` → `"1 ժ 30 ր"`.
 *
 * Never «0 րոպե»: a driver who is genuinely 40 seconds away still needs a
 * number a person would say out loud, and rounding that to zero reads as a bug.
 * Minimum one minute.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''

  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  if (totalMinutes < 60) return `${totalMinutes} րոպե`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} ժ` : `${hours} ժ ${minutes} ր`
}

/**
 * The full distance line, including which kind of distance it is.
 *
 * The two prefixes are not interchangeable and the difference is the honest
 * part: «Ճանապարհով» is a real routed figure, «Ուղիղ գծով» is a straight line
 * that ignores every road, river and mountain between the two points. A page
 * that printed one number under one label would be presenting the worse of the
 * two as if it were the better.
 */
export function formatDistanceLine(meters: number, routed: boolean): string {
  const distance = formatDistance(meters)
  if (!distance) return ''
  return routed ? `Ճանապարհով՝ մոտ ${distance}` : `Ուղիղ գծով՝ մոտ ${distance}`
}

/** `480` → `"Մոտավոր՝ 8 րոպե"`. Only ever called when a real routed duration exists. */
export function formatDurationLine(seconds: number): string {
  const duration = formatDuration(seconds)
  return duration ? `Մոտավոր՝ ${duration}` : ''
}
