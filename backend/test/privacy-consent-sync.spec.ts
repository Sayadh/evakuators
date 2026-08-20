import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PRIVACY_CONSENT_CHECKBOX_LABEL,
  PRIVACY_CONSENT_PARAGRAPHS,
  PRIVACY_DATA_CONTROLLER,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from '../src/privacy-consent/privacy-consent.text'

/**
 * MANUAL SYNC POINT — `frontend/constants/privacyConsent.ts`.
 *
 * The backend owns the consent text: it hashes its own copy and stores that
 * hash in every consent record, so the string over here is what a driver's
 * consent legally attests to. The frontend keeps a copy purely so the dialog
 * can render without a round-trip.
 *
 * A drift between the two is therefore not cosmetic — the driver would be
 * ticking a box next to text that is not the text being recorded, which makes
 * the stored attestation false. Nothing in the type system can catch that
 * (they are two separate projects with no shared package), so this test reads
 * the sibling file as TEXT and fails when a paragraph, the label, the version
 * or the controller name has moved on one side only.
 *
 * Same technique, and the same reasoning, as the geography and service-slug
 * sync tests. See CLAUDE.md § manual sync points.
 */

const FRONTEND = fileURLToPath(
  new URL('../../frontend/constants/privacyConsent.ts', import.meta.url),
)

const source = readFileSync(FRONTEND, 'utf8')

/**
 * The one paragraph the frontend cannot hold as a single string.
 *
 * «Մանրամասները ներկայացված են «Գաղտնիության քաղաքականությունում»։» has a link
 * in the middle of it, so the dialog splits it into three constants
 * (`…_BEFORE`, `…_LINK_LABEL`, `…_AFTER`) and renders an anchor between them.
 * Concatenated back together they must reproduce the backend's paragraph
 * character for character — which is what this reassembles and checks, rather
 * than exempting the sentence from the comparison and losing the guarantee for
 * the one paragraph that names the policy document.
 */
function reassembleLinkSentence(): string | null {
  const read = (name: string): string | null =>
    // Non-greedy up to the closing quote; these are single-quoted single-line
    // constants, which is the only form this file uses.
    source.match(new RegExp(`${name} =\\s*'([^']*)'`))?.[1] ?? null

  const before = read('PRIVACY_CONSENT_POLICY_SENTENCE_BEFORE')
  const link = read('PRIVACY_CONSENT_POLICY_LINK_LABEL')
  const after = read('PRIVACY_CONSENT_POLICY_SENTENCE_AFTER')

  return before !== null && link !== null && after !== null ? `${before}${link}${after}` : null
}

describe('the consent text is identical on both sides', () => {
  it('has every backend paragraph present verbatim in the frontend file', () => {
    // Two backend paragraphs are stored differently on the frontend, and both
    // splits are deliberate rather than drift:
    //
    // - `PRIVACY_CONSENT_PARAGRAPHS[0]` is the title, split out as
    //   `PRIVACY_CONSENT_TITLE` so the dialog renders it as a heading.
    // - the last one carries a link, so it is three constants — reassembled by
    //   `reassembleLinkSentence` and compared in full below.
    //
    // Everything else must appear verbatim as an array entry.
    const linkSentence = reassembleLinkSentence()

    for (const paragraph of PRIVACY_CONSENT_PARAGRAPHS) {
      const present = source.includes(paragraph) || paragraph === linkSentence

      expect(
        present,
        `Frontend privacyConsent.ts is missing this paragraph:\n\n${paragraph}\n`,
      ).toBe(true)
    }
  })

  it('reassembles the policy-link sentence to exactly the backend wording', () => {
    // Asserted on its own as well, so a broken regex above cannot make the
    // loop pass vacuously: if the three constants were renamed,
    // `reassembleLinkSentence` returns null and this fails loudly rather than
    // the sentence silently dropping out of the comparison.
    expect(reassembleLinkSentence()).toBe(
      PRIVACY_CONSENT_PARAGRAPHS[PRIVACY_CONSENT_PARAGRAPHS.length - 1],
    )
  })

  it('has the checkbox label verbatim', () => {
    // The single most important string in the feature: it is the sentence the
    // driver actually ticks, and it is part of the hashed canonical text.
    expect(source).toContain(PRIVACY_CONSENT_CHECKBOX_LABEL)
  })

  it('agrees on the policy version', () => {
    // The version the dialog sends is checked against the backend's constant.
    // If the frontend's copy were bumped alone, every driver would be told to
    // reload forever; if the backend's were bumped alone, drivers would be
    // re-asked but their answers rejected.
    expect(source).toContain(`PRIVACY_POLICY_VERSION = '${PRIVACY_POLICY_VERSION}'`)
  })

  it('agrees on the effective date and the data controller', () => {
    expect(source).toContain(PRIVACY_POLICY_EFFECTIVE_DATE)
    expect(source).toContain(PRIVACY_DATA_CONTROLLER)
  })

  it('names this file, so whoever edits the copy is told about the other one', () => {
    // The comment is load-bearing. A developer changing the wording reads the
    // file they are editing, not this test — the pointer has to be there.
    expect(source).toContain('privacy-consent.text.ts')
    expect(source).toContain('MANUAL SYNC POINT')
  })
})

describe('the frontend never computes or sends a hash', () => {
  it('has no sha256 or hashing of the consent text', () => {
    // A client-supplied hash proves only that the client can run SHA-256. The
    // server hashes its own canonical copy; if this ever changes, the accept
    // DTO would have to grow a field it deliberately does not have.
    expect(source.toLowerCase()).not.toContain('sha256')
    expect(source).not.toContain('consentTextHash')
  })
})

describe('the policy page and the dialog cannot disagree', () => {
  const PRIVACY_PAGE = fileURLToPath(new URL('../../frontend/pages/privacy.vue', import.meta.url))
  const page = readFileSync(PRIVACY_PAGE, 'utf8')

  it('reads the version, date and controller from the shared constants', () => {
    // Typed literally into the markup, these would be a fourth copy — and the
    // one on a rarely-opened static page is the copy that silently goes stale.
    expect(page).toContain("from '~/constants/privacyConsent'")
    expect(page).toContain('PRIVACY_POLICY_VERSION')
    expect(page).toContain('PRIVACY_POLICY_EFFECTIVE_DATE')
    expect(page).toContain('PRIVACY_DATA_CONTROLLER')
  })

  it('is reachable from the footer on every page, not only from the dialog', () => {
    const NAVIGATION = fileURLToPath(
      new URL('../../frontend/constants/navigation.ts', import.meta.url),
    )
    // A policy reachable only from a modal you must be mid-signup to see is not
    // a published policy — and a visitor who never registers has the same right
    // to read what the site does with their data.
    expect(readFileSync(NAVIGATION, 'utf8')).toContain("to: '/privacy'")
  })

  /**
   * The two retention numbers §5/§7 state in prose (180 days for visitor
   * statistics, 3 years for a withdrawn consent's audit trail) are not derived
   * from any shared constant — Nuxt and Nest are separate projects with no
   * shared package, exactly like the consent text above. So the numbers are
   * typed into the markup by hand, and this is what keeps a future change to
   * either retention constant from quietly making the policy state a duration
   * the backend no longer honours.
   */
  it('states the same visitor-statistics retention as ANALYTICS_VISITOR_DAY_RETENTION_DAYS', async () => {
    const { ANALYTICS_VISITOR_DAY_RETENTION_DAYS } = await import(
      '../src/analytics/analytics.constants'
    )
    expect(page).toContain(`${ANALYTICS_VISITOR_DAY_RETENTION_DAYS} օր`)
  })

  it('states the same consent-audit retention as CONSENT_AUDIT_RETENTION_DAYS', async () => {
    const { CONSENT_AUDIT_RETENTION_DAYS } = await import(
      '../src/privacy-consent/privacy-consent.constants'
    )
    const years = CONSENT_AUDIT_RETENTION_DAYS / 365
    expect(Number.isInteger(years)).toBe(true)
    expect(page).toContain(`${years} տարի`)
  })
})
