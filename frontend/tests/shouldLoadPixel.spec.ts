import { describe, expect, it } from 'vitest'
import { shouldLoadPixel } from '~/utils/shouldLoadPixel'

/**
 * The check `plugins/meta-pixel.client.ts` runs before ever loading
 * `fbevents.js`. Exactly `shouldLoadGtag.spec.ts`'s two rules, applied to the
 * Meta Pixel's own id — these pin them directly, since the plugin itself
 * can't be mounted in this repo's test runtime (`docs/testing.md`).
 */
describe('shouldLoadPixel', () => {
  it('refuses when no id is configured', () => {
    // Staging's default (ecosystem.staging.config.js leaves
    // NUXT_PUBLIC_META_PIXEL_ID empty), and a developer's own machine.
    expect(shouldLoadPixel('', 'evakuators.am')).toBe(false)
    expect(shouldLoadPixel(undefined, 'evakuators.am')).toBe(false)
  })

  it('allows production’s id on production’s hostname', () => {
    expect(shouldLoadPixel('1596253742133677', 'evakuators.am')).toBe(true)
  })

  it('refuses production’s id on any other hostname — the hard invariant', () => {
    // Even if a config mistake ever carried production's real id into a
    // staging (or local) build, it still never fires from anywhere but the
    // real site.
    for (const hostname of ['staging.evakuators.am', 'localhost', '127.0.0.1', 'evakuators.am.evil.example']) {
      expect(shouldLoadPixel('1596253742133677', hostname)).toBe(false)
    }
  })

  it('allows a DIFFERENT id from any hostname — staging may run its own test pixel', () => {
    // The check guards one specific value, not "any id off the production
    // domain": a genuinely separate pixel is not production's data.
    expect(shouldLoadPixel('123456789', 'staging.evakuators.am')).toBe(true)
    expect(shouldLoadPixel('123456789', 'localhost')).toBe(true)
  })
})
