import 'reflect-metadata'
import { BadRequestException, RequestMethod } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { validateSync } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { AdminJwtGuard } from '../src/admin-auth/admin-jwt.guard'
import { AdminController } from '../src/admin/admin.controller'
import {
  ARMENIA_BOUNDS,
  assertWithinArmenia,
  decimalToNumber,
  isWithinArmenia,
  OUTSIDE_ARMENIA_MESSAGE,
} from '../src/common/coordinates'
import { SetCoordinatesDto } from '../src/common/set-coordinates.dto'
import { DriverJwtGuard } from '../src/driver-auth/driver-jwt.guard'
import { MyTowTruckController } from '../src/my-tow-truck/my-tow-truck.controller'
import { CreateRegistrationDto } from '../src/registration/dto/create-registration.dto'
import { RegistrationService } from '../src/registration/registration.service'

/**
 * The backend half of coordinate validation.
 *
 * The frontend has its own suite over the *parser* (one string → two numbers);
 * this one covers what the API actually enforces, which is deliberately a
 * different thing: the wire format is already two numbers by the time it gets
 * here, so what is left to prove is the range, the geography, and that neither
 * endpoint can be reached without an authentication guard.
 */

type Handler = (...args: never[]) => unknown

function handler(controller: object, name: string): Handler {
  return (controller as unknown as Record<string, Handler>)[name]!
}

function buildDto(latitude: unknown, longitude: unknown): SetCoordinatesDto {
  const dto = new SetCoordinatesDto()
  Object.assign(dto, { latitude, longitude })
  return dto
}

/** Which property names failed validation, so a test can name the field it means */
function failedProperties(dto: SetCoordinatesDto): string[] {
  return validateSync(dto).map((error) => error.property)
}

describe('SetCoordinatesDto', () => {
  it('accepts a real coordinate pair', () => {
    expect(failedProperties(buildDto(40.1792, 44.4991))).toEqual([])
  })

  it('accepts negative values — the shape of a coordinate, not of an Armenian one', () => {
    // Rejected later by assertWithinArmenia, not here. The two layers answer
    // different questions and this test pins that separation: if the range
    // check ever grew a country opinion, a value would get two error messages
    // at once (see common/coordinates.ts).
    expect(failedProperties(buildDto(-33.8688, 151.2093))).toEqual([])
  })

  it.each([
    ['a latitude above 90', 91, 44.4991, 'latitude'],
    ['a latitude below -90', -91, 44.4991, 'latitude'],
    ['a longitude above 180', 40.1792, 181, 'longitude'],
    ['a longitude below -180', 40.1792, -181, 'longitude'],
  ])('rejects %s', (_label, latitude, longitude, property) => {
    expect(failedProperties(buildDto(latitude, longitude))).toContain(property)
  })

  /**
   * `NaN` and `Infinity` are rejected by `@IsNumber`'s own defaults, which is
   * why the decorator is used rather than a bare `@Min`/`@Max` pair: a
   * range comparison against a non-finite value passes silently instead of
   * failing, so without this they would sail through into a DECIMAL column.
   */
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s as a latitude', (_label, value) => {
    expect(failedProperties(buildDto(value, 44.4991))).toContain('latitude')
  })

  it.each([
    ['a string', '40.1792'],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
  ])('rejects %s — both fields are required numbers', (_label, value) => {
    expect(failedProperties(buildDto(value, 44.4991))).toContain('latitude')
    expect(failedProperties(buildDto(40.1792, value))).toContain('longitude')
  })
})

describe('assertWithinArmenia', () => {
  it('passes for points across the country', () => {
    expect(() => assertWithinArmenia(40.1792, 44.4991)).not.toThrow() // Yerevan
    expect(() => assertWithinArmenia(40.7942, 43.8453)).not.toThrow() // Gyumri
    expect(() => assertWithinArmenia(38.8964, 46.2417)).not.toThrow() // Meghri
  })

  it('throws a 400 with the Armenian message for a point elsewhere', () => {
    expect(() => assertWithinArmenia(51.5074, -0.1278)).toThrow(BadRequestException)
    expect(() => assertWithinArmenia(51.5074, -0.1278)).toThrow(OUTSIDE_ARMENIA_MESSAGE)
  })

  /** A swapped pair is two valid numbers, so this box is the only thing that catches it */
  it('rejects a latitude/longitude pair entered in the wrong order', () => {
    expect(() => assertWithinArmenia(44.4991, 40.1792)).toThrow(BadRequestException)
  })

  it('treats the padded box as inclusive at every edge', () => {
    const { minLatitude, maxLatitude, minLongitude, maxLongitude } = ARMENIA_BOUNDS
    expect(isWithinArmenia(minLatitude, minLongitude)).toBe(true)
    expect(isWithinArmenia(maxLatitude, maxLongitude)).toBe(true)
    expect(isWithinArmenia(minLatitude - 0.01, minLongitude)).toBe(false)
    expect(isWithinArmenia(maxLatitude, maxLongitude + 0.01)).toBe(false)
  })

  /**
   * The padding is what stands between a border-town driver and being told
   * their own address is not in Armenia, so it is asserted as a property
   * rather than left as a number someone might tidy away.
   */
  it('stays padded beyond the real extent of the country on all four sides', () => {
    expect(ARMENIA_BOUNDS.minLatitude).toBeLessThan(38.84)
    expect(ARMENIA_BOUNDS.maxLatitude).toBeGreaterThan(41.3)
    expect(ARMENIA_BOUNDS.minLongitude).toBeLessThan(43.45)
    expect(ARMENIA_BOUNDS.maxLongitude).toBeGreaterThan(46.63)
  })
})

describe('decimalToNumber', () => {
  it('returns undefined for a null column rather than 0', () => {
    // 0,0 is a real coordinate (in the Gulf of Guinea). A null that mapped to
    // zero would put every driver without coordinates at the same fictional
    // point, which a distance calculation would happily rank as nearest.
    expect(decimalToNumber(null)).toBeUndefined()
  })

  it('converts a Decimal to a plain number, not a string', () => {
    // Prisma's Decimal is decimal.js, whose toJSON() returns a STRING — so
    // handing the raw column to a response would publish "40.179200" where
    // every other numeric field publishes a number.
    const decimal = { toNumber: () => 40.1792 } as unknown as Parameters<typeof decimalToNumber>[0]
    expect(decimalToNumber(decimal)).toBe(40.1792)
  })
})

describe('CreateRegistrationDto coordinates', () => {
  /**
   * Optional at sign-up, and the reason is worth restating where it can fail:
   * this field asks a driver to copy a value out of Google Maps on a phone, and
   * the registration form is the only way onto the platform. Blocking on it
   * trades a whole driver for one editable field.
   *
   * Only the two coordinate keys are asserted, so this stays a test about the
   * rule rather than about the twenty other fields the DTO happens to require.
   */
  function coordinateErrors(latitude: unknown, longitude: unknown): string[] {
    const dto = new CreateRegistrationDto()
    Object.assign(dto, { latitude, longitude })
    return validateSync(dto)
      .map((error) => error.property)
      .filter((property) => property === 'latitude' || property === 'longitude')
  }

  it('accepts a submission with no coordinates at all', () => {
    expect(coordinateErrors(undefined, undefined)).toEqual([])
  })

  it('still accepts a real pair', () => {
    expect(coordinateErrors(40.1792, 44.4991)).toEqual([])
  })

  it('still rejects a value that is not a coordinate', () => {
    // Optional means "may be absent", never "may be anything". A driver who
    // types something has to have typed something usable.
    expect(coordinateErrors(91, 44.4991)).toContain('latitude')
    expect(coordinateErrors(40.1792, '44.4991')).toContain('longitude')
    expect(coordinateErrors(Number.NaN, 44.4991)).toContain('latitude')
  })

  /**
   * The pair rule lives in RegistrationService, not here — class-validator
   * decorates one property at a time and cannot see a sibling. Asserted as an
   * absence so that moving the check into the DTO later does not go unnoticed:
   * if this ever starts failing, the rule has two homes.
   */
  it('leaves the both-or-neither rule to the service', () => {
    expect(coordinateErrors(40.1792, undefined)).toEqual([])
    expect(coordinateErrors(undefined, 44.4991)).toEqual([])
  })
})

describe('RegistrationService coordinate pairing', () => {
  function submitWith(latitude?: number, longitude?: number): Promise<unknown> {
    const service = new RegistrationService(
      { countUnattachedImages: async () => 0, create: async () => ({}) } as never,
      { notifyNewRegistration: async () => undefined } as never,
      { findByMainPhoneAnyStatus: async () => null } as never,
    )
    return service.submit({ phone: '+37491000001', imageIds: [], latitude, longitude } as never)
  }

  it.each([
    ['a latitude with no longitude', 40.1792, undefined],
    ['a longitude with no latitude', undefined, 44.4991],
  ])('rejects %s', async (_label, latitude, longitude) => {
    // Half a coordinate describes no place at all, and a row holding one would
    // be neither "has a location" nor "has none" for every reader downstream.
    // Rejected rather than silently dropped, so a broken client is reported
    // instead of hidden.
    await expect(submitWith(latitude, longitude)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects a complete pair outside Armenia', async () => {
    await expect(submitWith(51.5074, -0.1278)).rejects.toThrow(OUTSIDE_ARMENIA_MESSAGE)
  })

  it('accepts a submission with no coordinates at all', async () => {
    // The headline behaviour of this change, asserted end to end through the
    // service rather than only on the DTO: a driver who could not manage the
    // Google Maps step still gets onto the platform. If the geography check
    // ever stops being guarded, `undefined` reaches assertWithinArmenia and
    // this throws instead of resolving.
    await expect(submitWith(undefined, undefined)).resolves.toBeDefined()
  })
})

describe('coordinate endpoints are behind an auth guard', () => {
  /**
   * The security property is not "the service checks ownership" — it is that
   * neither route can express someone else's truck in the first place. The
   * driver route takes its id from the JWT (there is no `:id` param to tamper
   * with), and the admin route is the only one that names an id, behind
   * AdminJwtGuard.
   */
  it('mounts PATCH /my/tow-truck/coordinates behind DriverJwtGuard, with no id in the path', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MyTowTruckController)).toBe('my/tow-truck')

    const route = handler(MyTowTruckController.prototype, 'updateCoordinates')
    expect(Reflect.getMetadata(PATH_METADATA, route)).toBe('coordinates')
    expect(Reflect.getMetadata(METHOD_METADATA, route)).toBe(RequestMethod.PATCH)

    // Guard is on the controller, so every route here inherits it — including
    // any added later without thinking about it.
    const guards = Reflect.getMetadata(GUARDS_METADATA, MyTowTruckController) as unknown[]
    expect(guards).toContain(DriverJwtGuard)
  })

  it('mounts PATCH /admin/tow-trucks/:id/coordinates behind AdminJwtGuard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminController)).toBe('admin')

    const route = handler(AdminController.prototype, 'setCoordinates')
    expect(Reflect.getMetadata(PATH_METADATA, route)).toBe('tow-trucks/:id/coordinates')
    expect(Reflect.getMetadata(METHOD_METADATA, route)).toBe(RequestMethod.PATCH)

    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminController) as unknown[]
    expect(guards).toContain(AdminJwtGuard)
  })

  /**
   * The admin route is three segments and `tow-trucks/count` is two, so
   * neither can shadow the other. Restated here as well as in
   * admin.controller.count-route.spec.ts because this is the route that made
   * the question live again — the general rule is asserted over the whole
   * table there.
   */
  it('cannot shadow the literal tow-trucks/count route', () => {
    const coordinates = Reflect.getMetadata(
      PATH_METADATA,
      handler(AdminController.prototype, 'setCoordinates'),
    ) as string
    const count = Reflect.getMetadata(
      PATH_METADATA,
      handler(AdminController.prototype, 'countTowTrucks'),
    ) as string

    expect(coordinates.split('/')).toHaveLength(3)
    expect(count.split('/')).toHaveLength(2)
  })
})
