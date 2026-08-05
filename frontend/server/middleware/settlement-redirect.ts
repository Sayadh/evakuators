import { staticRegions } from '~/data/regions'
import { staticSettlements } from '~/data/settlement'
import { resolveSettlementTarget } from '~/utils/locationSearch'
import { getCityRoute } from '~/utils/routeHelpers'

/**
 * Permanent redirects from a settlement URL to the road corridor that serves it.
 *
 * ## Why server middleware and not a page-level redirect
 *
 * A settlement whose coverage is a corridor has no page of its own — «Գառնի» is
 * served as part of «Գառնի–Գեղարդ», and that corridor is the canonical URL. The
 * old settlement URL therefore has to answer 301, not render something.
 *
 * Doing it in the page would only cover client-side navigation: a crawler, a
 * pasted link or a cold reload hits the server first, and a page that renders
 * and *then* redirects has already returned 200 with a body. Search engines
 * treat that as a soft redirect at best. Middleware runs before rendering, so
 * the answer is a real 301 from the first byte.
 *
 * The map is built once at module scope — 20 entries, resolved from the same
 * `resolveSettlementTarget` the search index uses, so the redirect target and
 * the search result can never point at different places.
 */

const REDIRECTS: Map<string, string> = (() => {
  const regionById = new Map(staticRegions.map((region) => [region.id, region]))
  const map = new Map<string, string>()

  for (const settlement of staticSettlements) {
    if (settlement.targetServiceZoneId === undefined) continue

    const region = regionById.get(settlement.regionId)
    const target = resolveSettlementTarget(settlement)
    if (!region || !target || target.type !== 'zone') continue

    map.set(
      getCityRoute(region.slug, settlement.slug),
      getCityRoute(target.regionSlug, target.slug),
    )
  }

  return map
})()

export default defineEventHandler((event) => {
  const path = event.path?.split('?')[0]
  if (!path) return

  // Trailing slashes are the same URL to a visitor and a different key here.
  const target = REDIRECTS.get(path.length > 1 ? path.replace(/\/$/, '') : path)
  if (!target) return

  // 301, not 302: this is a permanent statement about where the content lives,
  // and it goes straight to the final canonical URL — no chain through an
  // intermediate page, which would dilute the signal and cost a round trip.
  return sendRedirect(event, target, 301)
})
