import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source-text assertions, not a live call — `dispatch` early-returns on
 * `import.meta.client`, which this repo's plain-Vitest/node config never
 * replaces (no Nuxt vite plugin here, `vitest.config.ts`), so every call in
 * this environment is a guaranteed no-op regardless of what `window.dataLayer`
 * is set to. Same reasoning, same pattern as `trackMetaPixelContact.spec.ts`.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

/**
 * Strips block and line comments.
 *
 * The negative assertions below are about what the file DOES, and this file's
 * doc comments deliberately name the very things the code must not contain —
 * `shouldLoadGtag`, `send_to`, the Ads id — in order to explain why they are
 * absent. Asserting against the raw text would fail on the explanation rather
 * than on a real regression.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('utils/analytics dispatch', () => {
  const source = read('utils/analytics.ts')

  it('is a no-op outside the client, same guard as the other trackers', () => {
    expect(source).toContain('import.meta.client')
  })

  it('reaches gtag through window.dataLayer, the same mechanism nuxt-gtag itself pushes with', () => {
    expect(source).toContain('window.dataLayer?.push(arguments)')
  })

  it('sends an "event" command, so every tracked action lands in GA4 as a named event', () => {
    expect(source).toContain("gtagCommand('event', event")
  })

  /**
   * The invariant this whole file is shaped around, asserted in
   * `utils/shouldLoadGtag.ts` and CLAUDE.md: Google Ads conversions ride the
   * GA4 tag via a link made in Google's own UI, so the Ads id is not a second
   * id anywhere in this codebase. A `send_to: 'AW-.../label'` here would
   * reintroduce one — and a conversion label that nothing can keep in sync.
   */
  it('names no AW- id and no send_to conversion label', () => {
    expect(code(source)).not.toContain('AW-')
    expect(code(source)).not.toContain('send_to')
  })

  it('does not re-check the gates that plugins/gtag-gate.client.ts already owns', () => {
    expect(code(source)).not.toContain('shouldLoadGtag')
    expect(code(source)).not.toContain('isAdminRoute')
    expect(code(source)).not.toContain('cookieConsent')
  })
})

describe('phone clicks still funnel through usePhoneActions', () => {
  const source = read('composables/usePhoneActions.ts')

  it('fires the external-analytics phone event, which is what Google Ads imports as a conversion', () => {
    const phoneHandler = source.slice(
      source.indexOf('onPhoneClick:'),
      source.indexOf('onWhatsAppClick:'),
    )
    expect(phoneHandler).toContain('trackPhoneClick(')
  })
})
