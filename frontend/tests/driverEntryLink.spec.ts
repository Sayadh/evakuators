import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import hy from '~/i18n/locales/hy.json'
import { LOGIN_LINK } from '~/constants/navigation'

/**
 * The driver's way back into their own profile.
 *
 * `/login` used to be linked from nowhere: a driver who registered, closed the
 * tab and came back had to type the URL or dig out an old email — on a site
 * whose entire paid product is that profile. This pins that the link exists in
 * both places that show it, and that it stays a constant.
 *
 * Source text rather than a mount, same reasoning as the other header specs
 * (`docs/testing.md`): the wiring is the subject, and mounting the header would
 * mean standing up the router for two links.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const header = readFileSync(`${ROOT}components/layout/AppHeader.vue`, 'utf8')
const drawer = readFileSync(`${ROOT}components/layout/MobileMenu.vue`, 'utf8')

describe('driver login link', () => {
  it('says «Մուտք» and points at the login page', () => {
    // The word itself lives in `i18n/locales/*.json` now, because the header
    // renders it in three languages; the constant carries the key and the
    // destination, which are the parts that must not vary.
    expect(LOGIN_LINK).toEqual({ labelKey: 'nav.login', to: '/login' })
    expect(hy['nav'].login).toBe('Մուտք')
  })

  it('is in the header', () => {
    expect(header).toContain('LOGIN_LINK.to')
    expect(header).toContain('LOGIN_LINK.label')
  })

  it('is in the mobile drawer too, which is the only place most phones show it', () => {
    // The header hides it below 768px; the drawer carries it at every width.
    expect(drawer).toContain('LOGIN_LINK.to')
    expect(drawer).toContain('LOGIN_LINK.label')
  })

  it('reads no session state, in either place', () => {
    // The label is the same signed in or out, and `driver-guest` forwards a
    // signed-in driver to the dashboard. Reading the localStorage-backed store
    // into the markup of the one component that renders on every page would
    // mean the server and the client disagree — a site-wide hydration
    // mismatch, in exchange for one word.
    expect(header).not.toContain('useDriverAuthStore')
    expect(drawer).not.toContain('useDriverAuthStore')
  })
})
