import { describe, expect, it } from 'vitest'
import { isAdminRoute } from '~/utils/isAdminRoute'

/**
 * The boundary `plugins/gtag-admin-skip.client.ts` decides on: whether the
 * current path is inside the admin panel, and therefore whether gtag.js
 * should ever load at all.
 */
describe('isAdminRoute', () => {
  it('matches the admin root', () => {
    expect(isAdminRoute('/admin')).toBe(true)
  })

  it('matches everything under it', () => {
    expect(isAdminRoute('/admin/registrations/12')).toBe(true)
  })

  it('does not match a public path that merely starts with the same letters', () => {
    // The bug a naive `startsWith('/admin')` would have: a page like
    // `/administration` would wrongly count as admin and silently lose
    // analytics. Nothing in this app is named that today, but the predicate
    // should not depend on that staying true.
    expect(isAdminRoute('/administration')).toBe(false)
  })

  it('does not match the public site', () => {
    for (const path of ['/', '/register', '/dashboard', '/yerevan/nor-nork', '/tow-trucks/some-slug']) {
      expect(isAdminRoute(path)).toBe(false)
    }
  })
})
