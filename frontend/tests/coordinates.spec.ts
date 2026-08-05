import { describe, expect, it } from 'vitest'
import {
  ARMENIA_BOUNDS,
  COORDINATE_MESSAGES,
  formatCoordinates,
  isWithinArmenia,
  parseCoordinates,
} from '~/utils/coordinates'

/**
 * The base parking coordinate parser — the single piece of logic behind all
 * three places a coordinate can be entered (registration, the driver's
 * dashboard dialog, the admin's dialog).
 *
 * Assertions compare against `COORDINATE_MESSAGES.*` rather than against
 * literal Armenian strings on purpose: what matters is *which rule* rejected a
 * value, and rewording a message should not fail a test about rule selection.
 */
describe('parseCoordinates — accepted input', () => {
  const YEREVAN = { latitude: 40.1792, longitude: 44.4991 }

  it.each([
    ['comma and space (Google Maps copy button)', '40.1792, 44.4991'],
    ['space only', '40.1792 44.4991'],
    ['comma, no space', '40.1792,44.4991'],
    ['leading and trailing whitespace from a paste', '  40.1792, 44.4991  '],
    ['a line break instead of a space', '40.1792\n44.4991'],
  ])('accepts %s', (_label, input) => {
    expect(parseCoordinates(input)).toEqual({ ok: true, ...YEREVAN })
  })

  it('accepts integers, not just decimals', () => {
    expect(parseCoordinates('40, 44')).toEqual({ ok: true, latitude: 40, longitude: 44 })
  })

  /**
   * The corners are the whole reason the bounding box is padded — a driver
   * genuinely parked near Bagratashen or Meghri must not be told their own
   * address is outside the country.
   */
  it('accepts the padded bounding box itself, corner to corner', () => {
    for (const latitude of [ARMENIA_BOUNDS.minLatitude, ARMENIA_BOUNDS.maxLatitude]) {
      for (const longitude of [ARMENIA_BOUNDS.minLongitude, ARMENIA_BOUNDS.maxLongitude]) {
        expect(parseCoordinates(`${latitude}, ${longitude}`)).toMatchObject({ ok: true })
      }
    }
  })
})

describe('parseCoordinates — rejected input', () => {
  it('rejects an empty or whitespace-only value', () => {
    expect(parseCoordinates('')).toEqual({ ok: false, error: COORDINATE_MESSAGES.required })
    expect(parseCoordinates('   ')).toEqual({ ok: false, error: COORDINATE_MESSAGES.required })
  })

  /**
   * The pasted-wrong cases. Each one is a real shape a value arrives in, not a
   * hypothetical: a separator that got lost, a half-copied pair, one value too
   * many, and a place name that came along with the numbers.
   */
  it.each([
    ['two numbers run together with no separator', '40.179244.4991'],
    ['only one number', '40.1792'],
    ['three numbers', '40.1792, 44.4991, 41.0000'],
    ['a trailing separator with nothing after it', '40.1792,'],
    ['an incomplete decimal', '40., 44.4991'],
    ['a lone minus sign', '-, 44.4991'],
    ['two decimal points in one number', '40.17.92, 44.4991'],
  ])('rejects %s as "not two coordinates"', (_label, input) => {
    expect(parseCoordinates(input)).toEqual({ ok: false, error: COORDINATE_MESSAGES.pair })
  })

  /**
   * Letters are caught at the character level rather than by `Number()`
   * returning NaN — which is what makes `NaN` and `Infinity` unrepresentable
   * here rather than merely unlikely. There is no path from this input to a
   * non-finite number, because the characters that spell one never get through.
   */
  it.each([
    ['a word', 'abc, 44.4991'],
    ['the literal NaN', 'NaN, 44.4991'],
    ['the literal Infinity', 'Infinity, 44.4991'],
    ['exponent notation', '4e1, 44.4991'],
    ['a degree symbol', '40.1792°, 44.4991°'],
    ['a compass letter', '40.1792N, 44.4991E'],
    ['a semicolon separator', '40.1792; 44.4991'],
  ])('rejects %s as an illegal character', (_label, input) => {
    expect(parseCoordinates(input)).toEqual({ ok: false, error: COORDINATE_MESSAGES.characters })
  })

  it('rejects a latitude outside ±90 with the latitude message', () => {
    expect(parseCoordinates('91, 44')).toEqual({
      ok: false,
      error: COORDINATE_MESSAGES.latitudeRange,
    })
    expect(parseCoordinates('-90.1, 44')).toEqual({
      ok: false,
      error: COORDINATE_MESSAGES.latitudeRange,
    })
  })

  it('rejects a longitude outside ±180 with the longitude message', () => {
    expect(parseCoordinates('40, 181')).toEqual({
      ok: false,
      error: COORDINATE_MESSAGES.longitudeRange,
    })
    expect(parseCoordinates('40, -180.5')).toEqual({
      ok: false,
      error: COORDINATE_MESSAGES.longitudeRange,
    })
  })

  /**
   * The check the whole bounding box exists for: a pair typed in the wrong
   * order is two perfectly valid numbers, so nothing before this catches it.
   */
  it('rejects a swapped pair as outside Armenia', () => {
    expect(parseCoordinates('44.4991, 40.1792')).toEqual({
      ok: false,
      error: COORDINATE_MESSAGES.outsideArmenia,
    })
  })

  it.each([
    ['London', '51.5074, -0.1278'],
    ['the equator at the prime meridian', '0, 0'],
    ['Moscow', '55.7558, 37.6173'],
  ])('rejects %s as outside Armenia', (_label, input) => {
    expect(parseCoordinates(input)).toEqual({
      ok: false,
      error: COORDINATE_MESSAGES.outsideArmenia,
    })
  })

  /**
   * Order of the checks, asserted as a rule rather than through one example: a
   * value that is not a coordinate at all must never be told it is "not in
   * Armenia", because that sends the driver to their map instead of to their
   * typo.
   */
  it('reports the range problem, not the geography one, for an impossible number', () => {
    expect(parseCoordinates('991, 44.4991')).toEqual({
      ok: false,
      error: COORDINATE_MESSAGES.latitudeRange,
    })
  })
})

describe('isWithinArmenia', () => {
  it('accepts points across the country', () => {
    expect(isWithinArmenia(40.1792, 44.4991)).toBe(true) // Yerevan
    expect(isWithinArmenia(40.7942, 43.8453)).toBe(true) // Gyumri
    expect(isWithinArmenia(38.8964, 46.2417)).toBe(true) // Meghri
    expect(isWithinArmenia(41.1417, 44.1836)).toBe(true) // Tashir
  })

  it('rejects points just outside each edge of the padded box', () => {
    const { minLatitude, maxLatitude, minLongitude, maxLongitude } = ARMENIA_BOUNDS
    const inLat = 40.1792
    const inLng = 44.4991
    expect(isWithinArmenia(minLatitude - 0.01, inLng)).toBe(false)
    expect(isWithinArmenia(maxLatitude + 0.01, inLng)).toBe(false)
    expect(isWithinArmenia(inLat, minLongitude - 0.01)).toBe(false)
    expect(isWithinArmenia(inLat, maxLongitude + 0.01)).toBe(false)
  })
})

describe('formatCoordinates', () => {
  it('round-trips through the parser', () => {
    const formatted = formatCoordinates(40.1792, 44.4991)
    expect(formatted).toBe('40.1792, 44.4991')
    // The value shown back to a driver must be a value they could have typed —
    // otherwise re-opening the dialog and pressing Save would fail on text the
    // form itself produced.
    expect(parseCoordinates(formatted)).toEqual({ ok: true, latitude: 40.1792, longitude: 44.4991 })
  })

  it('returns an empty string when either half is missing', () => {
    expect(formatCoordinates(undefined, 44.4991)).toBe('')
    expect(formatCoordinates(40.1792, undefined)).toBe('')
    expect(formatCoordinates(undefined, undefined)).toBe('')
  })
})
