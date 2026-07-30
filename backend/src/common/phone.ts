import { applyDecorators } from '@nestjs/common'
import { Matches } from 'class-validator'

/**
 * The one canonical shape a driver phone number may take in this system:
 * `+374` followed by exactly 8 digits, with no spaces, dashes or brackets.
 *
 * Mirrors `armenianPhoneInputValue()` in `frontend/utils/formatPhone.ts` and
 * `isPhone()` in `frontend/utils/validators.ts` — the frontend has always
 * produced exactly this, on every phone input, via a v-model transform.
 */
export const ARMENIAN_PHONE_PATTERN = /^\+374\d{8}$/

export const ARMENIAN_PHONE_MESSAGE = 'Հեռախոսահամարը պետք է լինի այս ձևաչափով՝ +37491000001'

/**
 * The single reusable phone rule — apply it to every field that holds a main
 * driver phone number.
 *
 * ## Why this has to be one rule and not four `@Matches` calls
 *
 * `TowTruck.phone` is the driver-login key: `DriverAuthService` finds a truck
 * by it with an exact string comparison (`where: { phone }`), and it must be
 * unique across trucks. Both of those properties only hold if every value
 * that ever reaches the column is written the same way.
 *
 * Before this existed, the format was enforced in exactly ONE place —
 * `SetTowTruckPhoneDto`, the admin-only correction endpoint — while
 * registration and both driver-auth endpoints accepted any 8-20 character
 * string. The frontend normalized everything, so real data stayed clean, but
 * nothing in the backend required it: a direct API call could store
 * `"+374 93 632003"`, and login would then never find that driver again,
 * because the string it searches with would not match the string that was
 * stored.
 *
 * That also makes the `@unique` constraint on the column meaningful. A unique
 * index enforces uniqueness of the *string*; without a canonical format,
 * `+37493632003` and `+374 93 632003` are two different strings and the
 * database would happily hold both — a false guarantee, which is worse than
 * none.
 *
 * Deliberately not applied to `secondaryPhone` / `whatsapp`: neither is a
 * lookup key, neither is unique, and both are free to hold whatever a driver
 * can actually be reached on.
 */
export function IsArmenianPhone(): PropertyDecorator {
  return applyDecorators(Matches(ARMENIAN_PHONE_PATTERN, { message: ARMENIAN_PHONE_MESSAGE }))
}
