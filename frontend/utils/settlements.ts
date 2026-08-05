import { staticCities } from '~/data/cities'
import { staticRegions } from '~/data/regions'
import { staticSettlements, type StaticSettlement } from '~/data/settlement'
import { isLandingSettlement, resolveSettlementTarget } from './locationSearch'
import { getCityRoute } from './routeHelpers'

/**
 * Settlement lookups for routing and page rendering.
 *
 * Kept apart from `locationSearch.ts` on purpose: that file answers "what did
 * the visitor type", this one answers "what is at this URL". They share
 * `resolveSettlementTarget` so the two can never disagree about where a
 * settlement points.
 */

const regionBySlug = new Map(staticRegions.map((region) => [region.slug, region]))
const cityById = new Map(staticCities.map((city) => [city.id, city]))

/**
 * The settlement at `/regions/<regionSlug>/<slug>`, if any.
 *
 * Scoped by marz because settlement slugs are only unique within one — there
 * are two `akunk`, two `teghut`, two `aghavnadzor`. A country-wide lookup would
 * return whichever came first in the file.
 */
export function findSettlement(regionSlug: string, slug: string): StaticSettlement | undefined {
  const region = regionBySlug.get(regionSlug)
  if (!region) return undefined
  return staticSettlements.find(
    (settlement) => settlement.regionId === region.id && settlement.slug === slug,
  )
}

/**
 * What a settlement URL should do.
 *
 * - `redirect` — a permanent move to the corridor that serves this place. The
 *   corridor is the canonical page; this URL should not exist in its own right.
 * - `landing` — it has its own page, its own canonical and its own copy.
 * - `city` — the long-standing fallback: no routing fields, so it is simply
 *   part of its target city's coverage and has no page of its own.
 */
export type SettlementRouting =
  | { kind: 'redirect'; target: string }
  | { kind: 'landing'; settlement: StaticSettlement; cityRoute: string }
  | { kind: 'city'; target: string }

export function resolveSettlementRouting(settlement: StaticSettlement): SettlementRouting | null {
  const target = resolveSettlementTarget(settlement)
  if (!target) return null

  if (target.type === 'zone') {
    return { kind: 'redirect', target: getCityRoute(target.regionSlug, target.slug) }
  }
  if (isLandingSettlement(settlement)) {
    return {
      kind: 'landing',
      settlement,
      cityRoute: getCityRoute(target.regionSlug, target.slug),
    }
  }
  return { kind: 'city', target: getCityRoute(target.regionSlug, target.slug) }
}

/** The city whose drivers a landing settlement lists — never a new filter of its own */
export function findSettlementTargetCity(settlement: StaticSettlement) {
  return cityById.get(settlement.targetCityId)
}

/** Every landing settlement, for the sitemap */
export function getLandingSettlements(): StaticSettlement[] {
  return staticSettlements.filter(isLandingSettlement)
}
