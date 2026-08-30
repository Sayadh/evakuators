import { describe, expect, it } from 'vitest'
import { shouldTrackPixelPageView } from '~/utils/shouldTrackPixelPageView'

/**
 * The dedup rule `plugins/meta-pixel.client.ts` runs before ever calling
 * `fbq('track', 'PageView')` — pinned directly since the plugin itself can't
 * be mounted here (`docs/testing.md`).
 */
describe('shouldTrackPixelPageView', () => {
  it('tracks the very first view of a page session', () => {
    // `null` is what the plugin starts with — nothing sent yet.
    expect(shouldTrackPixelPageView(null, '/')).toBe(true)
    expect(shouldTrackPixelPageView(null, '/register')).toBe(true)
  })

  it('does not re-track the same path', () => {
    // The bug this exists to prevent: a route watcher re-firing for a
    // reason other than an actual navigation (a query-only change, for
    // instance) must not double-count as a second page view.
    expect(shouldTrackPixelPageView('/register', '/register')).toBe(false)
  })

  it('tracks a genuine route change', () => {
    expect(shouldTrackPixelPageView('/', '/register')).toBe(true)
  })
})
