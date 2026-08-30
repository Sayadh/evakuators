import { describe, expect, it } from 'vitest'
import { shouldTrackPixelContact } from '~/utils/shouldTrackPixelContact'

/**
 * The dedup rule `plugins/meta-pixel.client.ts` runs before ever calling
 * `fbq('track', 'Contact')` — pinned directly since the plugin itself can't
 * be mounted here (`docs/testing.md`).
 */
describe('shouldTrackPixelContact', () => {
  it('tracks the very first contact of a page session', () => {
    // `null` is what the plugin starts with — nothing sent yet.
    expect(shouldTrackPixelContact(null, 'truck_card:tel:+37400000000')).toBe(true)
  })

  it('does not re-track a double-tap on the same driver’s button', () => {
    // The bug this exists to prevent: a `tel:` handoff can feel
    // unresponsive on mobile, and a visitor tapping again on the same link
    // must not double-count as a second, distinct contact.
    const key = 'truck_card:tel:+37400000000'
    expect(shouldTrackPixelContact(key, key)).toBe(false)
  })

  it('tracks a second, different driver’s button on the same page', () => {
    expect(shouldTrackPixelContact('truck_card:tel:+37400000000', 'truck_card:tel:+37411111111')).toBe(
      true,
    )
  })

  it('tracks a different source for the same phone number', () => {
    // Source is part of the key on purpose: the office number reused as a
    // driver's own contact (or vice versa) must not suppress a genuine
    // second event.
    expect(shouldTrackPixelContact('site_contact:tel:+37400000000', 'truck_card:tel:+37400000000')).toBe(
      true,
    )
  })
})
