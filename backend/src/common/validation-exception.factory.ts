import { BadRequestException } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'

/**
 * Matches any Armenian letter (U+0530–U+058F) — how `translateConstraint`
 * below tells an already-translated class-validator message (`IsArmenianPhone`
 * in `common/phone.ts`, `IsLatitudeValue`/`IsLongitudeValue` in
 * `common/coordinates.ts`, `TOO_MANY_MESSAGE` in `registration-profile.dto.ts`,
 * and every other DTO decorator that already sets its own `{ message: '...' }`)
 * apart from class-validator's own English default.
 */
const ARMENIAN_LETTER = /[԰-֏]/

/**
 * class-validator constraint type → generic Armenian phrase, keyed exactly
 * the way class-validator names them in `ValidationError.constraints`
 * (its own decorator-derived camelCase names — `@IsNotEmpty()` fails as
 * `isNotEmpty`, `@ArrayMaxSize()` as `arrayMaxSize`, and so on).
 *
 * Only a fallback — see `translateConstraint`. Only decorators actually used
 * somewhere in `src/**\/*.dto.ts` are listed; anything else falls through to
 * `FALLBACK_MESSAGE`, which is still a real Armenian sentence, just not one
 * naming the specific problem.
 */
const GENERIC_MESSAGE_BY_CONSTRAINT: Record<string, (property: string) => string> = {
  isNotEmpty: (p) => `«${p}» դաշտը պարտադիր է`,
  isDefined: (p) => `«${p}» դաշտը պարտադիր է`,
  isString: (p) => `«${p}» դաշտը պետք է լինի տեքստ`,
  isBoolean: (p) => `«${p}» դաշտի արժեքը սխալ է`,
  isInt: (p) => `«${p}» դաշտը պետք է լինի ամբողջ թիվ`,
  isNumber: (p) => `«${p}» դաշտը պետք է լինի թիվ`,
  isPositive: (p) => `«${p}» դաշտը պետք է լինի դրական թիվ`,
  isEmail: (p) => `«${p}» դաշտը վավեր էլ. հասցե չէ`,
  isEnum: (p) => `«${p}» դաշտի արժեքն անթույլատրելի է`,
  isIn: (p) => `«${p}» դաշտի արժեքն անթույլատրելի է`,
  isUUID: (p) => `«${p}» դաշտի նույնականացուցիչը սխալ է`,
  isArray: (p) => `«${p}» դաշտը պետք է լինի ցանկ`,
  arrayNotEmpty: (p) => `«${p}» դաշտը չի կարող դատարկ լինել`,
  arrayUnique: (p) => `«${p}» դաշտում կրկնվող արժեքներ կան`,
  arrayMinSize: (p) => `«${p}» դաշտում արժեքները քիչ են`,
  arrayMaxSize: (p) => `«${p}» դաշտում արժեքները շատ են`,
  matches: (p) => `«${p}» դաշտի ձևաչափը սխալ է`,
  min: (p) => `«${p}» դաշտի արժեքը սահմանից փոքր է`,
  max: (p) => `«${p}» դաշտի արժեքը սահմանից մեծ է`,
  minLength: (p) => `«${p}» դաշտը շատ կարճ է`,
  maxLength: (p) => `«${p}» դաշտը շատ երկար է`,
  equals: (p) => `«${p}» դաշտի արժեքը սխալ է`,
}

const FALLBACK_MESSAGE = (property: string): string => `«${property}» դաշտը սխալ լրացված է`

/** No field name at all — every property in the payload was rejected wholesale (e.g. a non-object body). */
const NO_VALID_FIELDS_MESSAGE = 'Ուղարկված տվյալները սխալ են'

/**
 * One message for one failing constraint, preferring whatever the DTO
 * decorator already said (see the module doc comment) and falling back to a
 * generic Armenian phrase — keyed by class-validator's own constraint-type
 * name — for the majority of decorators across the DTO layer that never got
 * a custom one.
 */
function translateConstraint(property: string, constraintType: string, original: string): string {
  if (ARMENIAN_LETTER.test(original)) return original
  const generic = GENERIC_MESSAGE_BY_CONSTRAINT[constraintType]
  return generic ? generic(property) : FALLBACK_MESSAGE(property)
}

/**
 * Walks nested/array DTOs (`@ValidateNested`, e.g. `CreateRegistrationDto`'s
 * `serviceAreas: ServiceAreaDto[]`) so a failure two levels down still names
 * the real field (`serviceAreas.0.type`) instead of just `serviceAreas`.
 */
function collectMessages(errors: ValidationError[], pathPrefix = ''): string[] {
  const messages: string[] = []
  for (const error of errors) {
    const path = pathPrefix ? `${pathPrefix}.${error.property}` : error.property
    if (error.constraints) {
      for (const [type, message] of Object.entries(error.constraints)) {
        messages.push(translateConstraint(path, type, message))
      }
    }
    if (error.children?.length) {
      messages.push(...collectMessages(error.children, path))
    }
  }
  return messages
}

/**
 * `ValidationPipe`'s `exceptionFactory` (wired in `main.ts`) — replaces
 * class-validator's raw `ValidationError[]` with ONE readable
 * `BadRequestException`, so `extractErrorMessage()` on the frontend
 * (`frontend/utils/errors.ts`) always has real text to show a driver instead
 * of class-validator's own English default ("phone must match
 * /^\+374\d{8}$/") or a bare, untranslated array.
 *
 * Deliberately does not touch any of the 26 DTO files: every decorator that
 * already sets its own Armenian `{ message: '...' }` keeps it verbatim (see
 * `translateConstraint`), and every one that doesn't gets a generic-but-real
 * Armenian sentence instead — a single point of truth rather than hundreds of
 * individual edits across the DTO layer.
 */
export function buildValidationException(errors: ValidationError[]): BadRequestException {
  const messages = collectMessages(errors)
  return new BadRequestException(messages.join(' · ') || NO_VALID_FIELDS_MESSAGE)
}
