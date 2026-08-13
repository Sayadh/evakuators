import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Every field that participates in a credential exchange must name its role
 * with an `autocomplete` token.
 *
 * This is not only the Chrome DOM warning that surfaced it. Without the token
 * a password manager cannot tell the three password fields in the
 * change-password form apart, and typically fills all three with the saved
 * one — the driver then gets a validation error about a password they never
 * typed. On the two login forms the effect is quieter and worse: nothing is
 * offered at all, so a driver holding a Telegram-issued password has to
 * retype it by hand every time.
 *
 * Source-text assertions, per docs/testing.md: this repo has no component
 * test runtime, and the property being guarded is the presence of an
 * attribute in the template, which reads perfectly well as text.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

const adminPage = read('pages/admin.vue')
const loginPage = read('pages/login.vue')
const changePassword = read('components/common/ChangePasswordForm.vue')
const appInput = read('components/common/AppInput.vue')

describe('AppInput can carry an autocomplete token', () => {
  it('accepts the prop and renders it as an attribute', () => {
    // Both halves matter: a declared prop that is never bound renders nothing,
    // and a bound attribute with no declared prop lands in $attrs on the
    // wrapper div rather than on the input.
    expect(appInput).toContain('autocomplete?: AutocompleteToken')
    expect(appInput).toContain(':autocomplete="autocomplete"')
  })

  it('leaves it undefined by default, so ordinary fields emit no attribute', () => {
    // A blanket default would be wrong: most fields here (plate number, price,
    // capacity) match no autofill category, and guessing one for them invites
    // the browser to fill nonsense.
    expect(appInput).toContain('autocomplete: undefined')
  })

  it('constrains the value to real HTML tokens', () => {
    // A typo in a token is silently ignored by every browser, which would put
    // the field straight back to the state this test exists to prevent.
    expect(appInput).toContain('type AutocompleteToken')
  })
})

describe('the credential forms name their fields', () => {
  it('admin login pairs a username with a current password', () => {
    expect(adminPage).toContain('autocomplete="username"')
    expect(adminPage).toContain('autocomplete="current-password"')
  })

  it('the admin second factor is offered as a one-time code', () => {
    expect(adminPage).toContain('autocomplete="one-time-code"')
  })

  it('driver login pairs a username with a current password', () => {
    // The driver's username IS their phone number — `username`, not `tel`, is
    // what pairs it with the password for a password manager.
    expect(loginPage).toContain('autocomplete="username"')
    expect(loginPage).toContain('autocomplete="current-password"')
  })

  it('the change-password form distinguishes the old password from the new one', () => {
    expect(changePassword).toContain('autocomplete="current-password"')
    // Both the new password and its confirmation, or a manager still cannot
    // tell which entry it is being asked to update.
    const newPasswordTokens = changePassword.match(/autocomplete="new-password"/g) ?? []
    expect(newPasswordTokens).toHaveLength(2)
  })

  it('never marks a password field `off`', () => {
    // Browsers increasingly ignore `off` on password fields anyway, so it buys
    // nothing and reads as an intent we are not actually able to enforce.
    for (const form of [adminPage, loginPage, changePassword]) {
      expect(form).not.toContain('autocomplete="off"')
    }
  })
})
