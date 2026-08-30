import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `pages/privacy.vue` used to describe GA4/Ads/the Meta Pixel only as
 * "third-party web statistics and ad-effectiveness tracking services" —
 * accurate, but not the specific disclosure a consent-driven cookie banner
 * (`CookieConsentBanner.vue`, `stores/cookieConsent.ts`) actually needs to
 * point at. § 5.2 names the three tools; this pins the disclosures that
 * section promised, since nothing here renders in this repo's test runtime
 * (`docs/testing.md`).
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const privacyPage = readFileSync(`${ROOT}pages/privacy.vue`, 'utf8')

describe('§ 5.2 names every tool this site actually loads', () => {
  it.each(['Google Analytics 4', 'Google Ads', 'Meta Pixel'])('names %s', (tool) => {
    expect(privacyPage).toContain(tool)
  })
})

describe('§ 5.2 covers what the consent gate promises', () => {
  it('states tracking only starts after accepting', () => {
    expect(privacyPage).toMatch(/չի? միանում ինքնաբերաբար/)
    expect(privacyPage).toContain('«Ընդունել»')
  })

  it('states rejecting sends nothing and clears the cookies already set', () => {
    expect(privacyPage).toContain('«Մերժել»')
    expect(privacyPage).toContain('_ga')
    expect(privacyPage).toContain('_fbp')
  })

  it('points to the footer’s settings link for changing or withdrawing the choice later', () => {
    expect(privacyPage).toContain('Cookie-ների կարգավորումներ')
  })

  it('states Advanced Matching is currently off', () => {
    expect(privacyPage).toContain('Advanced Matching')
    expect(privacyPage).toMatch(/ակտիվացված չէ/)
  })

  it('states form content, phone number and email are never sent to the Pixel', () => {
    expect(privacyPage).toContain('Ոչ մի ձևաթղթի բովանդակություն, հեռախոսահամար կամ էլ. փոստի հասցե')
  })
})
