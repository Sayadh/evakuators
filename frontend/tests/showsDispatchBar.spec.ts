import { describe, expect, it } from 'vitest'
import { showsDispatchBar } from '~/utils/showsDispatchBar'

/**
 * Which pages get the fixed «Զանգահարել մեզ» strip along the bottom.
 *
 * Pinned directly rather than through `layouts/default.vue`, which this repo
 * has no runtime to mount (`docs/testing.md`) — and the rule is the part worth
 * stating anyway. Two of these cases are the ones that actually cost something
 * if they regress: `/tow-trucks/*` (two fixed bars stacked, the operator's
 * number over the driver's own, on the page the driver pays for) and
 * `/admin/*` (a customer CTA inside the panel).
 */
describe('showsDispatchBar', () => {
  it('shows on the geography listing pages', () => {
    expect(showsDispatchBar('/regions')).toBe(true)
    expect(showsDispatchBar('/regions/kotayk')).toBe(true)
    expect(showsDispatchBar('/regions/kotayk/abovyan')).toBe(true)
    expect(showsDispatchBar('/yerevan')).toBe(true)
    expect(showsDispatchBar('/yerevan/arabkir')).toBe(true)
  })

  it('treats a trailing slash as the same page', () => {
    expect(showsDispatchBar('/regions/')).toBe(true)
    expect(showsDispatchBar('/yerevan/arabkir/')).toBe(true)
  })

  it('stays off the homepage, whose hero already carries the same offer', () => {
    expect(showsDispatchBar('/')).toBe(false)
  })

  it('stays off a driver profile, which has its own sticky bar', () => {
    // The one placement that would actively damage the product: the operator's
    // number pinned over the number of the driver who paid to be on that page.
    expect(showsDispatchBar('/tow-trucks/some-driver')).toBe(false)
  })

  it('stays out of the panel and the driver-facing pages', () => {
    for (const path of ['/admin', '/admin/dispatch', '/dashboard', '/login', '/register']) {
      expect(showsDispatchBar(path)).toBe(false)
    }
  })

  it('does not leak onto a deeper route under a matching prefix', () => {
    // Depth-bounded on purpose: a future page nested under a city has to be
    // considered rather than inheriting a fixed bar by accident.
    expect(showsDispatchBar('/regions/kotayk/abovyan/reviews')).toBe(false)
    expect(showsDispatchBar('/yerevan/arabkir/something')).toBe(false)
  })

  it('does not match a route that merely starts with the same letters', () => {
    expect(showsDispatchBar('/regions-old')).toBe(false)
    expect(showsDispatchBar('/yerevanski')).toBe(false)
  })
})
