/**
 * Armenia's bounding box and the point-in-box test — the dependency-free half
 * of `coordinates.ts`, split out so code that must not import Nest or Prisma
 * (the live-dispatch domain modules and their tests) uses the SAME numbers
 * rather than a copy. `coordinates.ts` re-exports both names, so every
 * existing import is unchanged.
 *
 * MANUAL SYNC POINT (unchanged): mirrored in `frontend/utils/coordinates.ts`.
 * See the doc comment in `coordinates.ts`.
 */
export const ARMENIA_BOUNDS_PADDING_DEGREES = 0.25

/**
 * Armenia's bounding box, already padded by the constant above.
 *
 * Unpadded extent, for reference when adjusting: latitude 38.84 (Meghri, the
 * southern tip) to 41.30 (Tavush/Lori, the northern border), longitude 43.45
 * (west of Armavir) to 46.63 (eastern Syunik).
 *
 * This is a rectangle, not the actual border polygon, and that is on purpose:
 * a polygon test would need a geometry dependency and a border dataset to
 * maintain, to reject points in Naxçıvan's airspace that no driver is going to
 * type by accident. Change these four numbers if the rule ever needs to move —
 * nothing else in the backend hardcodes a coordinate.
 */
export const ARMENIA_BOUNDS = {
  minLatitude: 38.84 - ARMENIA_BOUNDS_PADDING_DEGREES,
  maxLatitude: 41.3 + ARMENIA_BOUNDS_PADDING_DEGREES,
  minLongitude: 43.45 - ARMENIA_BOUNDS_PADDING_DEGREES,
  maxLongitude: 46.63 + ARMENIA_BOUNDS_PADDING_DEGREES,
} as const

export function isWithinArmenia(latitude: number, longitude: number): boolean {
  return (
    latitude >= ARMENIA_BOUNDS.minLatitude &&
    latitude <= ARMENIA_BOUNDS.maxLatitude &&
    longitude >= ARMENIA_BOUNDS.minLongitude &&
    longitude <= ARMENIA_BOUNDS.maxLongitude
  )
}
