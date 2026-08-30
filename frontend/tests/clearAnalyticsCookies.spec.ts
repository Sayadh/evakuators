import { describe, expect, it } from 'vitest'
import { isAnalyticsCookieName } from '~/utils/clearAnalyticsCookies'

/**
 * The predicate `clearAnalyticsCookies` runs before deleting anything —
 * pinned directly since `document.cookie` does not exist in this repo's
 * plain-Vitest/node test runtime (`docs/testing.md`).
 */
describe('isAnalyticsCookieName', () => {
  it('matches the exact GA4/Ads cookie names', () => {
    expect(isAnalyticsCookieName('_ga')).toBe(true)
    expect(isAnalyticsCookieName('_gid')).toBe(true)
  })

  it('matches any GA4 per-property cookie, not one hardcoded suffix', () => {
    // `_ga_<container-id>` — the suffix is the measurement id, which this
    // site's own `G-HEN3RVMTRG` is only one example of.
    expect(isAnalyticsCookieName('_ga_HEN3RVMTRG')).toBe(true)
    expect(isAnalyticsCookieName('_ga_SOMEOTHERID1')).toBe(true)
  })

  it('matches the Meta Pixel cookies', () => {
    expect(isAnalyticsCookieName('_fbp')).toBe(true)
    expect(isAnalyticsCookieName('_fbc')).toBe(true)
  })

  it('does not match this site’s own first-party cookies/keys', () => {
    // `evakuators:driver-session` and friends are localStorage keys, not
    // cookies, but the shared naming style is exactly why this predicate
    // must not just fuzzy-match "starts with an underscore".
    expect(isAnalyticsCookieName('evakuators-visitor-id')).toBe(false)
    expect(isAnalyticsCookieName('cookieConsent')).toBe(false)
  })

  it('does not match an unrelated cookie that merely starts with an underscore', () => {
    expect(isAnalyticsCookieName('_unrelated')).toBe(false)
  })
})
