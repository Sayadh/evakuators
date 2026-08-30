export type PixelContactSource = 'truck_card' | 'free_route' | 'site_contact'

/**
 * Which kind of `tel:` click this is, given the class list of the anchor
 * that was actually clicked (or the closest one, when the click landed on a
 * child element — see `plugins/meta-pixel.client.ts`'s `trackContact`).
 *
 * Pulled out as its own pure function — used by `plugins/meta-pixel.client.
 * ts` — so the bucketing rule has a direct test rather than only being
 * reachable through a Nuxt plugin this repo has no runtime to mount
 * (`docs/testing.md`).
 *
 * Three per-driver classes share the `truck_card` bucket, on purpose — all
 * three are "call this driver", just from different pages, and ad
 * optimization should treat them as the same conversion:
 * - `truck-card__call` — the listing card (`TowTruckCard.vue`; verified 35
 *   of 35 on `/yerevan`).
 * - `contact-actions__call` — the driver's own profile page
 *   (`TowTruckContactActions.vue`, used from `pages/tow-trucks/[slug].vue`).
 * - `profile__secondary-phone` — that same profile page's second number.
 *
 * `route-card__call` (`FreeRouteCard.vue`) gets its OWN bucket,
 * `free_route`, rather than folding into `truck_card`: a free-route booking
 * is a materially different conversion from hiring a tow truck, and
 * collapsing the two would hide which one an ad campaign is actually
 * driving.
 *
 * Everything else — the footer's own number (`footer__contact-link`), the
 * contact page, the registration page's support line — is `site_contact`:
 * "rang the office" is not the conversion ads should optimize for, and must
 * not share a bucket with either of the above. Takes the class list rather
 * than the element so it stays pure and directly testable.
 */
export function pixelContactSource(classNames: readonly string[]): PixelContactSource {
  if (
    classNames.includes('truck-card__call') ||
    classNames.includes('contact-actions__call') ||
    classNames.includes('profile__secondary-phone')
  ) {
    return 'truck_card'
  }
  if (classNames.includes('route-card__call')) return 'free_route'
  return 'site_contact'
}
