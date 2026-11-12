/**
 * "40.1772, 44.5126" (what Google Maps copies on a long press) → a point.
 *
 * MANUAL SYNC POINT: ARMENIA_BOUNDS mirrors backend/src/common/armenia-bounds.ts
 * (the server is the authority and rejects anything outside; this copy only
 * lets the driver see the problem while typing). test/coordinates.test.ts
 * reads the backend file as text so the numbers cannot drift.
 */
const PADDING = 0.25
export const ARMENIA_BOUNDS = {
  minLatitude: 38.84 - PADDING,
  maxLatitude: 41.3 + PADDING,
  minLongitude: 43.45 - PADDING,
  maxLongitude: 46.63 + PADDING,
} as const

export function isWithinArmenia(latitude: number, longitude: number): boolean {
  return (
    latitude >= ARMENIA_BOUNDS.minLatitude &&
    latitude <= ARMENIA_BOUNDS.maxLatitude &&
    longitude >= ARMENIA_BOUNDS.minLongitude &&
    longitude <= ARMENIA_BOUNDS.maxLongitude
  )
}

/** null for anything that is not a point inside Armenia */
export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  const match = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(input)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (!isWithinArmenia(latitude, longitude)) return null
  return { latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 }
}

export function formatCoordinates(point: { latitude: number; longitude: number }): string {
  return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`
}
