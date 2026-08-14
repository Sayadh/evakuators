import { describe, expect, it } from 'vitest'
import { shouldLoadGtag } from '~/utils/shouldLoadGtag'

/**
 * The check `plugins/gtag-gate.client.ts` runs before ever calling
 * `initialize()`. See that file and `shouldLoadGtag.ts` for the reasoning —
 * these tests pin the two rules directly, since the plugin itself can't be
 * mounted in this repo's test runtime (`docs/testing.md`).
 */
describe('shouldLoadGtag', () => {
  it('refuses when no id is configured', () => {
    // Staging's default (ecosystem.staging.config.js leaves
    // NUXT_PUBLIC_GTAG_ID empty), and a developer's own machine.
    expect(shouldLoadGtag('', 'evakuators.am')).toBe(false)
    expect(shouldLoadGtag(undefined, 'evakuators.am')).toBe(false)
  })

  it('allows production’s id on production’s hostname', () => {
    expect(shouldLoadGtag('G-HEN3RVMTRG', 'evakuators.am')).toBe(true)
  })

  it('refuses production’s id on any other hostname — the hard invariant', () => {
    // The check this file exists for: even if a config mistake ever carried
    // production's real id into a staging (or local) build, it still never
    // fires from anywhere but the real site.
    for (const hostname of ['staging.evakuators.am', 'localhost', '127.0.0.1', 'evakuators.am.evil.example']) {
      expect(shouldLoadGtag('G-HEN3RVMTRG', hostname)).toBe(false)
    }
  })

  it('allows a DIFFERENT id from any hostname — staging may run its own test property', () => {
    // The check guards one specific value, not "any id off the production
    // domain": a genuinely separate GA4 property is not production's data.
    expect(shouldLoadGtag('G-TESTSTAGING1', 'staging.evakuators.am')).toBe(true)
    expect(shouldLoadGtag('G-TESTSTAGING1', 'localhost')).toBe(true)
  })
})
