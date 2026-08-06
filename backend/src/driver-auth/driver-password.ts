import { randomInt } from 'node:crypto'

/**
 * The rules a driver password lives by, in one file because both halves of the
 * system have to agree on them: the DTO that accepts a new password and the
 * generator that mints a temporary one.
 */

/**
 * Cost factor for bcrypt. Matches what `admin:create` uses for admin accounts —
 * the two password stores should not have different resistance to the same
 * offline attack.
 */
export const BCRYPT_ROUNDS = 12

/**
 * Eight characters, not six: this is a permanent credential a driver picks
 * once, not a code that expires in five minutes.
 *
 * Mirrored by `isPassword()` in `frontend/utils/validators.ts` — a mismatch
 * there means the form accepts something the API then rejects, with a message
 * the driver has no way to act on.
 */
export const PASSWORD_MIN_LENGTH = 8

/**
 * Bcrypt silently truncates at 72 bytes, so anything longer is not "a longer
 * password", it is the same password with an invisible tail. Rejected outright
 * rather than accepted-and-truncated, which would let two different passwords
 * open the same account.
 */
export const PASSWORD_MAX_LENGTH = 72

/**
 * The alphabet a generated password is drawn from.
 *
 * Deliberately missing: `0`/`O`, `1`/`I`/`L`, and every lowercase letter. This
 * password is read off a Telegram message and typed into a phone by someone
 * standing next to a truck, and the pairs above are indistinguishable in most
 * sans-serif fonts. Dropping case entirely also means a driver never has to
 * work out whether autocapitalisation on their keyboard just changed the
 * password for them.
 *
 * 30 characters over 8 positions is ~39 bits of entropy. That is not a
 * long-lived secret — but it does not need to be one: it is single-use by
 * design (mustChangePassword forces a replacement at first login) and it is
 * rate-limited at the login endpoint.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Length of a generated password. Independent of PASSWORD_MIN_LENGTH but must never be below it. */
const GENERATED_LENGTH = 8

/**
 * A one-time password to hand a driver over Telegram.
 *
 * `randomInt` from node:crypto, not `Math.random()`: this value is a
 * credential, and `Math.random()` is a predictable PRNG. `randomInt(max)` is
 * also uniform over the range, so no character is more likely than another —
 * which a naive `% ALPHABET.length` on random bytes would not be.
 */
export function generateTemporaryPassword(): string {
  let password = ''
  for (let i = 0; i < GENERATED_LENGTH; i += 1) {
    password += ALPHABET[randomInt(ALPHABET.length)]
  }
  return password
}
