/**
 * Parsing and validating the base parking coordinates a driver pastes out of
 * Google Maps.
 *
 * ## One box in the UI, two numbers everywhere else
 *
 * Google Maps hands a driver a single string — `40.1792, 44.4991` — when they
 * long-press a point, and asking them to split it themselves would be asking
 * them to do work the computer is better at. So the form has one text field.
 *
 * That is the ONLY place the pair is ever a string. `parseCoordinates` splits
 * it before anything is submitted, the API takes two numbers, and the database
 * stores two `DECIMAL(9,6)` columns. This is the same call the platform
 * dimensions and the working hours already made in the other direction (two
 * inputs instead of one formatted box) and it is the same rule underneath: the
 * separator, the spacing and the punctuation are the UI's problem, never the
 * data's. See docs/taxonomies.md § "ask for the value, not the format".
 *
 * ## Why this file, and not three copies of a regex
 *
 * Three surfaces collect coordinates — the registration form, the driver's
 * dashboard dialog and the admin's dialog — and all three must accept exactly
 * the same things, or a driver gets told a value is invalid that an admin can
 * save for them one screen over. Everything below is pure and takes no Nuxt
 * context, so all three just call it.
 *
 * ## MANUAL SYNC POINT
 *
 * `ARMENIA_BOUNDS` is mirrored in `backend/src/common/coordinates.ts`, which
 * is the authority — this copy exists so a driver sees the problem while
 * typing instead of after a round trip. The two projects share no code (see
 * CLAUDE.md § "Monorepo layout"), so nothing catches a drift at compile time.
 * A drift here is not silent, though: the frontend would accept a point the
 * backend then rejects with a message the driver cannot act on. Change both,
 * or neither.
 */

/** Hard mathematical limits, independent of any country */
export const LATITUDE_LIMIT = 90
export const LONGITUDE_LIMIT = 180

/**
 * Padding added to every side of the country's real bounding box, in degrees.
 * 0.25° is roughly 28 km north–south and 21 km east–west at this latitude.
 *
 * Deliberately generous rather than snug: being too tight tells a driver
 * genuinely parked near Bagratashen or Meghri that their own address is not in
 * Armenia, with no way forward. Being too loose accepts a point in a border
 * strip, which this check never claimed to catch — its job is a swapped pair
 * (`44.4991, 40.1792`) or a coordinate from an entirely different country, and
 * it does that at any padding.
 */
export const ARMENIA_BOUNDS_PADDING_DEGREES = 0.25

/**
 * Armenia's bounding box, already padded by the constant above.
 *
 * Unpadded extent, for reference when adjusting: latitude 38.84 (Meghri) to
 * 41.30 (the northern border), longitude 43.45 (west of Armavir) to 46.63
 * (eastern Syunik). A rectangle rather than the border polygon on purpose — a
 * polygon test would need a geometry library and a border dataset to maintain,
 * to reject points no driver is going to type by accident.
 *
 * These four numbers are the only place a geographic limit is written on the
 * frontend. Change them here and every surface follows.
 */
export const ARMENIA_BOUNDS = {
  minLatitude: 38.84 - ARMENIA_BOUNDS_PADDING_DEGREES,
  maxLatitude: 41.3 + ARMENIA_BOUNDS_PADDING_DEGREES,
  minLongitude: 43.45 - ARMENIA_BOUNDS_PADDING_DEGREES,
  maxLongitude: 46.63 + ARMENIA_BOUNDS_PADDING_DEGREES,
} as const

/**
 * Every message this module can produce, in one object.
 *
 * Named rather than inlined so the tests assert the rule that fired, not the
 * wording — a reworded message should not fail a test about which check
 * caught what.
 */
export const COORDINATE_MESSAGES = {
  required: 'Մուտքագրեք երկու կոորդինատ, օրինակ՝ 40.1792, 44.4991',
  pair: 'Մուտքագրեք երկու կոորդինատ, օրինակ՝ 40.1792, 44.4991',
  characters: 'Կոորդինատներում թույլատրվում են միայն թվեր, կետ, ստորակետ և բացատ',
  latitudeRange: 'Լայնության արժեքը պետք է լինի -90-ից 90 միջակայքում',
  longitudeRange: 'Երկայնության արժեքը պետք է լինի -180-ից 180 միջակայքում',
  outsideArmenia: 'Նշված կետը Հայաստանի տարածքում չէ։ Խնդրում ենք կրկին ստուգել կոորդինատները',
} as const

export interface Coordinates {
  latitude: number
  longitude: number
}

export type ParseCoordinatesResult =
  | ({ ok: true } & Coordinates)
  | { ok: false; error: string }

/**
 * Every character the whole input may contain: digits, a decimal point, the
 * two separators, and a minus sign.
 *
 * The minus is accepted even though no point in Armenia has one — it belongs
 * to the general shape of a coordinate, and rejecting it at the character
 * level would report "only digits, dots, commas and spaces are allowed" for a
 * value whose real problem is that it is in the southern hemisphere. Letting
 * it through means that value reaches the bounds check and gets the message
 * that actually explains it.
 *
 * `e`/`E` is NOT here, which is what makes `Infinity`, `NaN` and `1e999`
 * impossible to express: all three are caught as characters, before any
 * `Number()` call can turn them into a value that compares strangely.
 */
const ALLOWED_CHARACTERS = /^[0-9.,\s-]+$/

/** A single coordinate: optional sign, digits, optional single decimal part */
const SINGLE_NUMBER = /^-?\d+(\.\d+)?$/

/**
 * `"  40.1792, 44.4991 "` → `{ ok: true, latitude: 40.1792, longitude: 44.4991 }`
 *
 * Accepted separators are a comma, whitespace, or a comma followed by
 * whitespace — those are the three shapes the value actually arrives in
 * (Google Maps' own copy button, a hand-typed pair, and a paste that picked up
 * a line break). Leading and trailing whitespace is stripped, because a paste
 * routinely carries it and failing on it would be failing on nothing.
 *
 * Returns the FIRST problem it finds rather than a list: the field shows one
 * message under one box, and the first thing wrong is the thing to fix.
 */
export function parseCoordinates(input: string): ParseCoordinatesResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: COORDINATE_MESSAGES.required }

  // Character check first, so "abc, 44.4991" is reported as an illegal
  // character rather than as "that isn't two numbers" — the second is true but
  // says nothing about what to do next.
  if (!ALLOWED_CHARACTERS.test(trimmed)) {
    return { ok: false, error: COORDINATE_MESSAGES.characters }
  }

  // One comma OR whitespace splits the pair. Collapsing "," and any run of
  // spaces into one separator is what makes `40.1792,44.4991`,
  // `40.1792, 44.4991` and `40.1792  44.4991` the same input — and what makes
  // `40.1792, 44.4991, 41.0000` three parts rather than two.
  const parts = trimmed.split(/\s*,\s*|\s+/).filter((part) => part.length > 0)
  if (parts.length !== 2) return { ok: false, error: COORDINATE_MESSAGES.pair }

  // `40.179244.4991` — one token with two decimal points. It passes the
  // character check and splits into a single part, so it is already caught
  // above; SINGLE_NUMBER is what catches the rest ("40.", "-", "1.2.3").
  if (!parts.every((part) => SINGLE_NUMBER.test(part))) {
    return { ok: false, error: COORDINATE_MESSAGES.pair }
  }

  const latitude = Number(parts[0])
  const longitude = Number(parts[1])

  // Belt and braces: SINGLE_NUMBER already excludes everything Number() turns
  // into NaN or Infinity, but a range comparison against a non-finite value
  // silently passes rather than fails, so this is not a check worth skipping.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: COORDINATE_MESSAGES.pair }
  }

  if (latitude < -LATITUDE_LIMIT || latitude > LATITUDE_LIMIT) {
    return { ok: false, error: COORDINATE_MESSAGES.latitudeRange }
  }
  if (longitude < -LONGITUDE_LIMIT || longitude > LONGITUDE_LIMIT) {
    return { ok: false, error: COORDINATE_MESSAGES.longitudeRange }
  }

  // Last, so a value that is not a coordinate at all never gets told it is "not
  // in Armenia" — a message that would send the driver looking at their map
  // instead of at their typo.
  if (!isWithinArmenia(latitude, longitude)) {
    return { ok: false, error: COORDINATE_MESSAGES.outsideArmenia }
  }

  return { ok: true, latitude, longitude }
}

export function isWithinArmenia(latitude: number, longitude: number): boolean {
  return (
    latitude >= ARMENIA_BOUNDS.minLatitude &&
    latitude <= ARMENIA_BOUNDS.maxLatitude &&
    longitude >= ARMENIA_BOUNDS.minLongitude &&
    longitude <= ARMENIA_BOUNDS.maxLongitude
  )
}

/**
 * The canonical way a stored pair is written back into the input box and shown
 * on screen: `40.1792, 44.4991`.
 *
 * One formatter so the value a driver sees after saving looks identical to the
 * one they pasted, whichever separator they actually used — and so re-opening
 * the dialog never presents a shape the parser would treat differently.
 *
 * Returns `''` when either half is missing: an incomplete pair is not a
 * location, and rendering half of one would read as a value that exists.
 */
export function formatCoordinates(latitude?: number, longitude?: number): string {
  if (latitude === undefined || longitude === undefined) return ''
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return ''
  return `${latitude}, ${longitude}`
}
