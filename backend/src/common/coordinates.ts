import { applyDecorators, BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { IsNumber, Max, Min } from 'class-validator'

/**
 * The one place the backend decides what counts as a valid parking coordinate.
 *
 * ## Why this is a separate file rather than four copies of `@Min`/`@Max`
 *
 * Three write paths set `TowTruck.latitude`/`longitude` — a driver's own
 * registration, the driver's own dashboard, and an admin correction — and all
 * three must agree on what they accept, or the same point is storable through
 * one door and rejected at another. Same reasoning as `common/phone.ts`: a
 * value that reaches one column from several entry points needs one rule, not
 * one rule per entry point.
 *
 * ## MANUAL SYNC POINT
 *
 * `ARMENIA_BOUNDS` below is mirrored in `frontend/utils/coordinates.ts`, which
 * is what actually shows a driver the "this point is not in Armenia" message
 * while they are typing. The two projects share no code (see CLAUDE.md
 * § "Monorepo layout"), so nothing enforces the match at compile time — but a
 * drift is not silent the way the `available-24-7` slug's would be: the
 * frontend simply accepts something the backend then rejects with a message
 * the driver cannot act on. Change both, or neither.
 */

/**
 * Hard mathematical limits, independent of any country. These exist to reject
 * an impossible number (and, via `@IsNumber`, `NaN`/`Infinity`) with a message
 * that says what the number is wrong about, before the Armenia check below
 * gets to talk about geography.
 */
export const LATITUDE_LIMIT = 90
export const LONGITUDE_LIMIT = 180

export const LATITUDE_RANGE_MESSAGE = 'Լայնության արժեքը պետք է լինի -90-ից 90 միջակայքում'
export const LONGITUDE_RANGE_MESSAGE = 'Երկայնության արժեքը պետք է լինի -180-ից 180 միջակայքում'
export const LATITUDE_NUMBER_MESSAGE = 'Լայնությունը պետք է լինի վավեր թիվ'
export const LONGITUDE_NUMBER_MESSAGE = 'Երկայնությունը պետք է լինի վավեր թիվ'

export const OUTSIDE_ARMENIA_MESSAGE =
  'Նշված կետը Հայաստանի տարածքում չէ։ Խնդրում ենք կրկին ստուգել կոորդինատները'

/**
 * Padding added to every side of the country's real bounding box, in degrees.
 *
 * 0.25° is roughly 28 km north–south and 21 km east–west at this latitude. It
 * is deliberately generous rather than snug: the cost of being too tight is a
 * driver genuinely parked near Bagratashen or Meghri being told their own
 * address is not in Armenia and having no way to proceed, while the cost of
 * being too loose is accepting a point in a neighbouring border strip — which
 * this check was never meant to catch anyway. Its job is to catch a swapped
 * pair (`44.4991, 40.1792`) or a coordinate pasted from an entirely different
 * country, and it does that at any padding.
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

/**
 * Latitude as it may arrive on any DTO in this project.
 *
 * `@IsNumber`'s defaults are the point of using it rather than `@IsNumberString`
 * or a bare `@Min`: `allowNaN` and `allowInfinity` are both false unless asked
 * for, so `NaN` and `Infinity` are rejected here and never reach the range
 * check (where they would compare false against everything and produce a
 * confusing "must be between -90 and 90" for a value that is not a number at
 * all). They are spelled out anyway, because that guarantee is load-bearing
 * and a reader should not have to remember a library default to see it.
 */
export function IsLatitudeValue(): PropertyDecorator {
  return applyDecorators(
    IsNumber({ allowNaN: false, allowInfinity: false }, { message: LATITUDE_NUMBER_MESSAGE }),
    Min(-LATITUDE_LIMIT, { message: LATITUDE_RANGE_MESSAGE }),
    Max(LATITUDE_LIMIT, { message: LATITUDE_RANGE_MESSAGE }),
  )
}

export function IsLongitudeValue(): PropertyDecorator {
  return applyDecorators(
    IsNumber({ allowNaN: false, allowInfinity: false }, { message: LONGITUDE_NUMBER_MESSAGE }),
    Min(-LONGITUDE_LIMIT, { message: LONGITUDE_RANGE_MESSAGE }),
    Max(LONGITUDE_LIMIT, { message: LONGITUDE_RANGE_MESSAGE }),
  )
}

/** Pure predicate — the assertion below is the one callers should use */
export function isWithinArmenia(latitude: number, longitude: number): boolean {
  return (
    latitude >= ARMENIA_BOUNDS.minLatitude &&
    latitude <= ARMENIA_BOUNDS.maxLatitude &&
    longitude >= ARMENIA_BOUNDS.minLongitude &&
    longitude <= ARMENIA_BOUNDS.maxLongitude
  )
}

/**
 * The geography half of the rule, kept OUT of the DTO on purpose.
 *
 * class-validator reports every failing constraint on a field at once, so a
 * latitude of `91` decorated with both the -90..90 range and an Armenia box
 * would come back as two messages joined together — "must be between -90 and
 * 90, this point is not in Armenia" — which reads like the system is confused
 * about which problem it found. Splitting them across the two layers the
 * codebase already separates (DTO = shape and range, service = business rule)
 * means exactly one message is ever produced, and the more specific one only
 * fires once the number itself is beyond question.
 *
 * Every write path that accepts coordinates must call this. There are three:
 * `RegistrationService.submit`, `MyTowTruckService.updateCoordinates` and
 * `AdminService.setTowTruckCoordinates`.
 */
export function assertWithinArmenia(latitude: number, longitude: number): void {
  if (!isWithinArmenia(latitude, longitude)) {
    throw new BadRequestException(OUTSIDE_ARMENIA_MESSAGE)
  }
}

/**
 * `Prisma.Decimal` → plain number for the API response.
 *
 * Needed because `Decimal` is decimal.js under the hood and its `toJSON()`
 * returns a **string**, so handing the raw column to a JSON response would
 * publish `"40.179200"` where every other numeric field in this API publishes
 * a number. The frontend types (and any future distance maths) expect a
 * number, so the conversion happens once, here, at the mapper boundary.
 */
export function decimalToNumber(value: Prisma.Decimal | null): number | undefined {
  return value === null ? undefined : value.toNumber()
}
