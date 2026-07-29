/**
 * Display formatting for the platform size. Nothing else — there is no parsing
 * step in this codebase any more.
 *
 * There used to be one. The registration form asked for a single free-text
 * `"5.5 մ × 2.2 մ"`, which meant a format regex to validate it, a parser to get
 * the numbers back out, and a `String` column on `RegistrationRequest` that had
 * to be converted before it could reach `TowTruck`'s two `Float` columns — a
 * conversion that for a long time simply wasn't wired up, so the answer was
 * collected from every driver and shown to nobody.
 *
 * Both forms now collect two numbers (`PlatformDimensionsInput.vue`) and both
 * tables store two floats, so the only thing left to do is print them.
 */

/**
 * `5.5, 2.2` → `"5.5 մ × 2.2 մ"`. Returns `''` when either is missing, so an
 * incomplete pair renders as nothing rather than as a half-written size.
 */
export function formatPlatformDimensions(lengthM?: number, widthM?: number): string {
  if (!lengthM || !widthM) return ''
  return `${lengthM} մ × ${widthM} մ`
}
