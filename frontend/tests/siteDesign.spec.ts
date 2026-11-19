import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { showsDispatchBar, showsDispatchBarForDesign } from '~/utils/showsDispatchBar'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('site design 2 — phone first (2026-11-18)', () => {
  it('the floating call button: design 1 as before; design 2 on every visitor page, never on our own pages', () => {
    for (const path of ['/', '/about', '/tow-trucks/x', '/contact', '/regions/kotayk/abovyan']) {
      expect(showsDispatchBarForDesign(path, false)).toBe(showsDispatchBar(path))
    }
    for (const path of ['/', '/about', '/contact', '/ru/contact', '/tow-trucks/x', '/manipulator']) expect(showsDispatchBarForDesign(path, true)).toBe(true)
    for (const path of ['/admin', '/admin/orders/5', '/dashboard', '/ru/dashboard', '/login', '/payment/idram/failed']) {
      expect(showsDispatchBarForDesign(path, true)).toBe(false)
    }
  })

  it('the in-page «nearest» / «free routes» offers ask the design; the nav does not', () => {
    for (const file of ['../components/home/HeroSection.vue', '../components/nearest/NearestTowTrucksCta.vue', '../pages/links.vue']) {
      expect(read(file), file).toMatch(/phoneFirst/)
    }
    // The header and drawer menus are NOT design-dependent: both links stay in the nav in design 2
    for (const file of ['../components/layout/AppHeader.vue', '../components/layout/MobileMenu.vue']) {
      expect(read(file), file).not.toMatch(/phoneFirst/)
    }
  })
})
