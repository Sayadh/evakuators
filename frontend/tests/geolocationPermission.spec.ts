import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * «Գտնել մոտակա էվակուատորները» after the browser has been refused once.
 *
 * A browser that has been told no remembers it: `getCurrentPosition` fails
 * immediately and raises no prompt at all. The page used to offer the same
 * button anyway and explain itself only after it had been pressed — an
 * invitation to fail, in front of somebody standing next to a broken car.
 *
 * Source-read: all of this is a handful of decisions in two files, and
 * mounting the page would pin its markup instead.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const composable = readFileSync(`${ROOT}composables/useGeolocation.ts`, 'utf8')
const page = readFileSync(`${ROOT}pages/evakuator.vue`, 'utf8')

describe('the page knows it has been refused before anyone presses', () => {
  it('asks the browser, and treats no answer as its own state', () => {
    // Safari does not answer `permissions.query` for geolocation, and older
    // WebViews have no `navigator.permissions` at all. Reading either as
    // "will ask" would be guessing about the one thing this exists to stop
    // guessing about.
    expect(composable).toContain("navigator.permissions.query({ name: 'geolocation'")
    expect(composable).toContain('navigator.permissions?.query')
    expect(composable).toContain("permission.value = 'unknown'")
  })

  it('learns the same fact from a refused press, so "denied" has one meaning', () => {
    // On Safari this is the only place the page ever finds out.
    expect(composable).toContain('=== PERMISSION_DENIED')
    expect(composable).toContain("permission.value = 'denied'")
  })

  it('does not leave a permission listener behind the page', () => {
    expect(composable).toContain('status.onchange = null')
  })
})

describe('what the page does about it', () => {
  it('stops offering a button that cannot work', () => {
    // Pressing it would set an error and change nothing.
    expect(page).toContain('@click="onLocatePress"')
    expect(page).toContain('if (locationBlocked.value) {')
    expect(page).toContain('permissionHelpOpen.value = true')
  })

  it('runs the search itself once the permission comes back', () => {
    // There is no API that opens the browser's settings, so the visitor
    // leaves the page to flip the switch. `onchange` is how we notice they
    // came back having flipped it.
    expect(page).toMatch(/watch\(permission, \(next, previous\) => \{/)
    expect(page).toContain("previous === 'denied' && next === 'granted'")
  })

  it('closes the instructions it no longer needs', () => {
    // The visitor fixed the permission in another screen and came back. A
    // dialog still telling them how to fix it is the page not noticing.
    const watcher = page.slice(page.indexOf('watch(permission,'))
    expect(watcher.slice(0, watcher.indexOf('})'))).toContain('permissionHelpOpen.value = false')
  })

  it('tells the visitor where the switch is, and does not pretend to reach it', () => {
    // No API opens a browser's settings — by design, or any site could reopen
    // a prompt it had just been refused. A link claiming to is a dead end
    // dressed as a fix.
    expect(page).toContain("t('nearest.permissionChrome')")
    expect(page).toContain("t('nearest.permissionSafari')")
    // In-app browsers are their own cause: the app itself often has no
    // location access, and no site-level setting can help there.
    expect(page).toContain("t('nearest.permissionInApp')")
    expect(page).not.toContain('chrome://')
    expect(page).not.toContain('app-settings:')
    expect(page).not.toContain('intent://')
  })
})
