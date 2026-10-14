import type { ServiceAreaJson } from '../tow-trucks/tow-truck.types'

/** One page a placement acts on — named by the frontend's static data from the slug */
export interface PromotionPlaceApi {
  type: 'city' | 'district'
  slug: string
  /** The stored name, as a fallback for a slug the frontend no longer knows */
  name: string
}

/** Where each product puts this driver — what the block explains, by name */
export interface PromotionPlacesApi {
  /** The driver's own page — «Իմ քաղաքում վերևում». Absent for a base that is no town. */
  home?: PromotionPlaceApi
  /**
   * The OTHER pages «Ամբողջ սպասարկման տարածքում» reaches: every city or
   * Yerevan district the driver names in their own coverage, minus their base.
   *
   * Exactly the pages `listing-order.ts` ranks them on (`coversExplicitly`):
   * corridors and marzes are not listed because the placement does nothing
   * there, and promising them would be selling a position that does not exist.
   */
  area: PromotionPlaceApi[]
}

export function promotionPlaces(truck: {
  citySlug: string | null
  districtSlug: string | null
  locationName: string
  serviceAreas: unknown
}): PromotionPlacesApi {
  const home: PromotionPlaceApi | undefined = truck.districtSlug
    ? { type: 'district', slug: truck.districtSlug, name: truck.locationName }
    : truck.citySlug
      ? { type: 'city', slug: truck.citySlug, name: truck.locationName }
      : undefined

  const seen = new Set<string>()
  const area: PromotionPlaceApi[] = []
  for (const entry of (truck.serviceAreas as ServiceAreaJson[] | null) ?? []) {
    if (entry.type !== 'city' && entry.type !== 'district') continue
    if (home && entry.type === home.type && entry.slug === home.slug) continue
    const key = `${entry.type}:${entry.slug}`
    if (seen.has(key)) continue
    seen.add(key)
    area.push({ type: entry.type, slug: entry.slug, name: entry.name })
  }

  return { ...(home ? { home } : {}), area }
}
