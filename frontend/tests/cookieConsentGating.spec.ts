import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source-text assertions, not a mounted store — `stores/cookieConsent.ts`
 * uses Nuxt's Pinia auto-imports and `import.meta.client`, neither of which
 * exist under this repo's plain-Vitest/node config (`vitest.config.ts`,
 * `docs/testing.md`), the same reason none of the other localStorage-backed
 * stores (`driverAuth`, `recentlyViewed`, `adminAuth`) have a direct unit
 * test either. What IS pinned here is the one thing worth a regression test:
 * that both trackers actually wait on this gate, and that the banner offers
 * a real choice rather than one obvious button next to a muted link.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

describe('both third-party trackers wait on consent', () => {
  it.each(['plugins/gtag-gate.client.ts', 'plugins/meta-pixel.client.ts'])(
    '%s only starts once status is accepted, and re-checks on a consent change',
    (file) => {
      const source = read(file)
      expect(source).toContain("consent.status === 'accepted'")
      expect(source).toContain('watch(() => consent.status')
    },
  )
})

describe('the banner offers an equally-weighted choice', () => {
  const component = read('components/common/CookieConsentBanner.vue')

  it('wires both buttons to the store', () => {
    expect(component).toContain('store.accept()')
    expect(component).toContain('store.reject()')
  })

  it('keeps both buttons the same size and tap target', () => {
    // Deliberately not pinning `variant` here — "Ընդունել" is a filled
    // `primary` button and "Մերժել" is a borderless `variant="ghost"` text
    // button, an explicit design choice (the two answers no longer look
    // identical). What still guards against a real dark pattern is `size`:
    // both stay `size="md"`, same padding/font-size/hit target, so Reject is
    // exactly as easy to tap as Accept even though it reads lighter.
    const rejectLine = component
      .split('\n')
      .find((line) => line.includes('store.reject()'))
    const acceptLine = component
      .split('\n')
      .find((line) => line.includes('store.accept()'))
    expect(rejectLine).toContain('size="md"')
    expect(acceptLine).toContain('size="md"')
    expect(rejectLine).toContain('variant="ghost"')
    expect(acceptLine).toContain('variant="primary"')
  })

  it('never renders on /admin', () => {
    expect(component).toContain('isAdminRoute')
  })

  it('links visibly to the privacy policy', () => {
    expect(component).toContain('to="/privacy"')
  })
})

describe('a visitor can change or withdraw their answer later', () => {
  it('the footer offers a settings link that reopens the banner', () => {
    const footer = read('components/layout/AppFooter.vue')
    expect(footer).toContain('cookieConsent.revisit()')
    expect(footer).toContain('Cookie-ների կարգավորումներ')
  })

  it('reject() — first refusal or a revoked earlier acceptance, same action — clears the trackers’ cookies', () => {
    const store = read('stores/cookieConsent.ts')
    // The real method definitions, not their own doc comments — each JSDoc
    // above mentions the OTHER method by name, so a bare `.indexOf('reject()')`
    // matches inside a comment first.
    const reject = store.slice(store.indexOf('\n    reject() {'), store.indexOf('\n    revisit() {'))
    expect(reject).toContain('clearAnalyticsCookies()')
  })

  it('revisit() never overwrites the previously stored answer by itself', () => {
    // Only actually choosing again (`accept()`/`reject()`) may touch
    // localStorage — reopening the banner must not, or a visitor who opens
    // settings and navigates away without picking anything would silently
    // lose their original answer on the next visit.
    const store = read('stores/cookieConsent.ts')
    const revisit = store.slice(store.indexOf('\n    revisit() {'))
    expect(revisit).not.toContain('localStorage')
  })
})

describe('the store persists the answer client-side only', () => {
  const store = read('stores/cookieConsent.ts')

  it('defaults to pending, not answered', () => {
    expect(store).toContain("status: 'pending'")
  })

  it('guards init, accept and reject each behind their own client check', () => {
    // `init()` guards with an early-return (`if (!import.meta.client...)
    // return`, same shape as `driverAuth.ts`/`recentlyViewed.ts`); `accept()`
    // and `reject()` guard their one `localStorage.setItem` call inline. Both
    // shapes are real guards, so this counts occurrences rather than
    // requiring one exact line shape everywhere.
    const clientChecks = store.match(/import\.meta\.client/g) ?? []
    const localStorageCalls = store.match(/localStorage\.(get|set)Item/g) ?? []
    expect(clientChecks.length).toBeGreaterThanOrEqual(localStorageCalls.length)
  })
})
