import { describe, expect, it } from 'vitest'
import { pixelContactSource } from '~/utils/pixelContactSource'

/**
 * The bucketing rule `plugins/meta-pixel.client.ts`'s `trackContact` runs
 * before ever calling `fbq('track', 'Contact')` — pinned directly since the
 * plugin itself can't be mounted here (`docs/testing.md`).
 */
describe('pixelContactSource', () => {
  it('buckets every per-driver call class as truck_card', () => {
    // Listing card, profile page primary number, profile page secondary
    // number — three different pages, the same "call this driver" intent.
    expect(pixelContactSource(['truck-card__call'])).toBe('truck_card')
    expect(pixelContactSource(['contact-actions__call'])).toBe('truck_card')
    expect(pixelContactSource(['profile__secondary-phone'])).toBe('truck_card')
  })

  it('still recognizes a per-driver class alongside other classes on the same element', () => {
    // `classList` order is not guaranteed, and a real anchor commonly
    // carries more than one class (layout/state classes, for instance).
    expect(pixelContactSource(['truck-card__call', 'is-active'])).toBe('truck_card')
    expect(pixelContactSource(['is-active', 'truck-card__call'])).toBe('truck_card')
  })

  it('buckets a free-route booking call as its own source, not truck_card', () => {
    // A materially different conversion from hiring a tow truck — folding
    // it into truck_card would hide which one an ad campaign is driving.
    expect(pixelContactSource(['route-card__call'])).toBe('free_route')
  })

  it('buckets the footer’s office number as site_contact', () => {
    expect(pixelContactSource(['footer__contact-link'])).toBe('site_contact')
  })

  it('defaults to site_contact for a class list with no match at all', () => {
    // The safe default: an unrecognized `tel:` link is treated as "not a
    // verified per-driver conversion" rather than silently counted as one.
    expect(pixelContactSource([])).toBe('site_contact')
  })
})
