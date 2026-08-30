import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source-text assertions, not a live call — `trackMetaPixelContact` early-
 * returns on `import.meta.client`, which this repo's plain-Vitest/node
 * config never replaces (no Nuxt vite plugin here, `vitest.config.ts`), so
 * every call in this environment is a guaranteed no-op regardless of what
 * `window.fbq` is set to. Same reasoning, same pattern as
 * `cookieConsentGating.spec.ts`.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

describe('trackMetaPixelContact', () => {
  const source = read('utils/trackMetaPixelContact.ts')

  it('is a no-op outside the client, same guard as the other trackers', () => {
    expect(source).toContain('import.meta.client')
  })

  it('fires the Contact standard event through window.fbq, not a custom event', () => {
    expect(source).toContain("window.fbq?.('track', 'Contact'")
  })
})

describe('usePhoneActions wires the Meta Pixel Contact event to WhatsApp only', () => {
  const source = read('composables/usePhoneActions.ts')

  it('fires on WhatsApp clicks', () => {
    const whatsappHandler = source.slice(
      source.indexOf('onWhatsAppClick:'),
      source.indexOf('onTelegramClick:'),
    )
    expect(whatsappHandler).toContain('trackMetaPixelContact(')
  })

  it('does NOT fire on phone clicks — meta-pixel.client.ts already tracks every tel: link itself, and firing here too would double-count the same click', () => {
    const phoneHandler = source.slice(
      source.indexOf('onPhoneClick:'),
      source.indexOf('onWhatsAppClick:'),
    )
    expect(phoneHandler).not.toContain('trackMetaPixelContact')
  })

  it('does NOT fire on Telegram — no ad campaign optimizes on it today', () => {
    const telegramHandler = source.slice(source.indexOf('onTelegramClick:'))
    expect(telegramHandler).not.toContain('trackMetaPixelContact')
  })
})
