import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DRIVER_ENTRY_SIGNED_OUT } from '~/composables/useDriverEntry'

/**
 * The driver's way back into their own profile.
 *
 * `/login` used to be linked from nowhere: a driver who registered, closed the
 * tab and came back had to type the URL or dig out an old email — on a site
 * whose entire paid product is that profile. This pins that the link exists in
 * both places that can show it, and that the pair cannot drift apart.
 *
 * Source text rather than a mount, same reasoning as the other header specs
 * (`docs/testing.md`): the wiring is the subject, and mounting the header would
 * mean standing up the router and the Pinia session for two links.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const header = readFileSync(`${ROOT}components/layout/AppHeader.vue`, 'utf8')
const drawer = readFileSync(`${ROOT}components/layout/MobileMenu.vue`, 'utf8')
const composable = readFileSync(`${ROOT}composables/useDriverEntry.ts`, 'utf8')

describe('driver entry link', () => {
  it('points a signed-out visitor at the login page', () => {
    expect(DRIVER_ENTRY_SIGNED_OUT).toEqual({ label: 'Մուտք', to: '/login' })
  })

  it('is in the header', () => {
    expect(header).toContain(':to="driverEntry.to"')
    expect(header).toContain('{{ driverEntry.label }}')
  })

  it('is in the mobile drawer too, which is the only place most phones show it', () => {
    // The header hides it below 768px; the drawer carries it at every width.
    expect(drawer).toContain(':to="driverEntry.to"')
    expect(drawer).toContain('{{ driverEntry.label }}')
  })

  it('reads the state from one place, so the two cannot disagree', () => {
    expect(header).toContain('useDriverEntry()')
    expect(drawer).toContain('useDriverEntry()')
    expect(header).not.toContain('useDriverAuthStore')
    expect(drawer).not.toContain('useDriverAuthStore')
  })

  it('renders the signed-out label until after mount', () => {
    // The session is localStorage-backed and loaded client-side only, so
    // reading it straight into the markup would render one label on the server
    // and another on the client — a hydration mismatch on the component that
    // appears on every page of the site.
    expect(composable).toContain('onMounted')
    expect(composable).toContain('mounted.value && driverAuth.isLoggedIn')
  })
})
