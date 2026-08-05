import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { staticServiceZones } from '~/data/serviceZones'
import { staticSettlements, type StaticSettlement } from '~/data/settlement'
import { getCityRoute, getDistrictRoute, getRegionRoute, getYerevanRoute } from './routeHelpers'
import { toSearchKey } from './transliteration'
import { YEREVAN_REGION_SLUG } from './geography'

/**
 * One search index over every kind of location the site knows about.
 *
 * ## Why one index and not four
 *
 * Cities, Yerevan districts, road corridors and settlements all answer the same
 * question — "where do you need a tow truck?" — and a visitor typing «Պտղնի»
 * does not know or care that it is a village rather than a town. Four separate
 * lookups would mean four ranking rules to keep in step and four places to
 * forget a case.
 *
 * ## Three scripts, one index
 *
 * Every term is stored under a transliterated key (see `transliteration.ts`),
 * so «Երևան», `yerevan` and «Ереван» are one entry rather than three rows of
 * data somebody has to keep in step. Russian spellings work for all 358
 * locations without a single Russian alias being written by hand.
 *
 * ## Why it is built once
 *
 * 46 cities + 12 districts + 12 zones + 300 settlements, each with aliases, is
 * ~800 normalized strings. Rebuilding that per keystroke is wasteful for no
 * benefit: the data is static and cannot change at runtime. The index is
 * therefore module scope — built on first import, reused for the life of the
 * process, and identical on the server and in the browser (so SSR and hydration
 * cannot disagree).
 *
 * No search library. The dataset is small enough that a prepared array plus a
 * `Map` for exact hits beats anything with an index-building step of its own.
 */

/** Where a result sends the visitor, and what it is */
export type LocationSearchResultType = 'region' | 'city' | 'district' | 'zone' | 'settlement'

export interface LocationSearchResult {
  /**
   * Deduplication key, NOT a display value. Several entries can resolve to one
   * destination — «Գառնի», «Գեղարդ» and the corridor itself all end at
   * `zone:garni-geghard` — and the visitor must be offered that destination
   * once. Region-scoped for settlements, because settlement slugs are only
   * unique within a marz (there are two Ակունք, two Թեղուտ, …).
   */
  key: string
  type: LocationSearchResultType
  /** Canonical Armenian name of the DESTINATION, not of the term matched */
  name: string
  /** Marz name, shown when two results would otherwise read identically */
  regionName: string
  route: string
}

/** One searchable term pointing at a result */
interface IndexEntry {
  /**
   * Script-agnostic comparison form — «Երևան», `yerevan` and «Ереван» all
   * become `erevan` here. Matching happens on this, never on the raw term, so
   * one entry serves all three scripts without three copies in the data.
   */
  normalized: string
  /** Canonical names rank above aliases — see `rank()` */
  isCanonicalName: boolean
  result: LocationSearchResult
}

/**
 * The one normalizer, used when building the index and when reading a query, so
 * both sides always agree.
 *
 * Deliberately narrow: it lowercases, trims, collapses runs of whitespace and
 * treats the three dash characters as one. It does NOT strip Armenian letters,
 * transliterate, or touch canonical slugs — a slug is an identifier and stays
 * exactly as authored.
 */
export function normalizeLocationQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
}

const regionById = new Map(staticRegions.map((region) => [region.id, region]))
const cityById = new Map(staticCities.map((city) => [city.id, city]))
const zoneById = new Map(staticServiceZones.map((zone) => [zone.id, zone]))

/**
 * Where a settlement actually sends a visitor.
 *
 * `targetServiceZoneId` wins when present — that is the explicit statement that
 * this place is served as part of a corridor. Everything else falls back to the
 * long-standing `targetCityId` behaviour, unchanged, which is what keeps the
 * 276 settlements with no routing fields working exactly as before.
 *
 * Returns null only for data that failed validation (a dangling id, or a target
 * in another marz), so a broken row drops out of search instead of producing a
 * link to nowhere.
 */
export function resolveSettlementTarget(
  settlement: StaticSettlement,
): { type: 'zone' | 'city'; slug: string; name: string; regionSlug: string; regionName: string } | null {
  const region = regionById.get(settlement.regionId)
  if (!region) return null

  if (settlement.targetServiceZoneId !== undefined) {
    const zone = zoneById.get(settlement.targetServiceZoneId)
    if (!zone || zone.regionId !== settlement.regionId) return null
    return { type: 'zone', slug: zone.slug, name: zone.name, regionSlug: region.slug, regionName: region.name }
  }

  const city = cityById.get(settlement.targetCityId)
  if (!city || city.regionId !== settlement.regionId) return null
  return { type: 'city', slug: city.slug, name: city.name, regionSlug: region.slug, regionName: region.name }
}

/** True when this settlement has its own indexable page rather than redirecting */
export function isLandingSettlement(settlement: StaticSettlement): boolean {
  return (
    settlement.seoMode === 'landing' &&
    settlement.indexable === true &&
    settlement.seo !== undefined
  )
}

function push(entries: IndexEntry[], terms: string[], canonical: string, result: LocationSearchResult): void {
  const seen = new Set<string>()
  for (const term of terms) {
    const normalized = toSearchKey(normalizeLocationQuery(term))
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    entries.push({
      normalized,
      isCanonicalName: normalized === toSearchKey(normalizeLocationQuery(canonical)),
      result,
    })
  }
}

/**
 * Built once. Order matters: cities and districts go in before settlements, so
 * that when an exact term is ambiguous the earlier — canonical, page-owning —
 * entry is the one kept. That is what gives the city priority the
 * Արարատ/Արմավիր conflicts need (a settlement shares the slug of a city in the
 * same marz; the city owns `/regions/ararat/ararat` and must keep it).
 */
const INDEX: IndexEntry[] = (() => {
  const entries: IndexEntry[] = []

  for (const city of staticCities) {
    const region = regionById.get(city.regionId)
    if (!region) continue
    push(entries, [city.name, city.slug, ...city.aliases], city.name, {
      key: `city:${city.slug}`,
      type: 'city',
      name: city.name,
      regionName: region.name,
      route: getCityRoute(region.slug, city.slug),
    })
  }

  for (const district of staticDistricts) {
    push(entries, [district.name, district.slug, ...district.aliases], district.name, {
      key: `district:${district.slug}`,
      type: 'district',
      name: district.name,
      regionName: 'Երևան',
      route: getDistrictRoute(district.slug),
    })
  }

  // Marzes, and the Yerevan pseudo-region. Added after cities so that a name
  // shared by both — «Արարատ» is a marz, a town AND a village — still resolves
  // to the town, which is what a person with a broken-down car means. Without
  // this block «Երևան» and «Ереван» matched nothing at all: Yerevan is not a
  // city row, it is a region whose "cities" are its districts (see CLAUDE.md).
  for (const region of staticRegions) {
    push(entries, [region.name, region.slug], region.name, {
      key: `region:${region.slug}`,
      type: 'region',
      name: region.name,
      regionName: region.name,
      route: getRegionRoute(region.slug),
    })
  }
  push(entries, ['Երևան', YEREVAN_REGION_SLUG, 'erevan'], 'Երևան', {
    key: `region:${YEREVAN_REGION_SLUG}`,
    type: 'region',
    name: 'Երևան',
    regionName: 'Երևան',
    route: getYerevanRoute(),
  })

  for (const zone of staticServiceZones) {
    const region = regionById.get(zone.regionId)
    if (!region) continue
    push(entries, [zone.name, zone.slug], zone.name, {
      key: `zone:${zone.slug}`,
      type: 'zone',
      name: zone.name,
      regionName: region.name,
      route: getCityRoute(region.slug, zone.slug),
    })
  }

  for (const settlement of staticSettlements) {
    const target = resolveSettlementTarget(settlement)
    if (!target) continue

    // A redirecting settlement contributes its NAME and ALIASES to the target's
    // result — searching «Գառնի» offers the corridor, once, and never a second
    // row for the village. A landing settlement keeps its own result and route.
    const result: LocationSearchResult = isLandingSettlement(settlement)
      ? {
          key: `settlement:${target.regionSlug}:${settlement.slug}`,
          type: 'settlement',
          name: settlement.name,
          regionName: target.regionName,
          route: getCityRoute(target.regionSlug, settlement.slug),
        }
      : {
          key: `${target.type}:${target.slug}`,
          type: target.type === 'zone' ? 'zone' : 'city',
          name: target.name,
          regionName: target.regionName,
          route: getCityRoute(target.regionSlug, target.slug),
        }

    push(entries, [settlement.name, settlement.slug, ...settlement.aliases], settlement.name, result)
  }

  return entries
})()

/** Exact hits, resolved without scanning — first writer wins, so cities win */
const EXACT = (() => {
  const map = new Map<string, LocationSearchResult>()
  for (const entry of INDEX) if (!map.has(entry.normalized)) map.set(entry.normalized, entry.result)
  return map
})()

/** Lower is better. Mirrors the documented priority order. */
function rank(entry: IndexEntry, query: string): number {
  if (entry.normalized === query) return entry.isCanonicalName ? 0 : 1
  if (entry.normalized.startsWith(query)) return entry.isCanonicalName ? 2 : 3
  if (entry.normalized.includes(query)) return 4
  return Number.POSITIVE_INFINITY
}

/**
 * Exactly one destination for a query, or null.
 *
 * Used by tests and by anything that needs "where does this term go" without a
 * dropdown. Ambiguous terms resolve by the index order above, which is why
 * «Արարատ» returns the city and not the village of the same name.
 */
export function findLocationExact(query: string): LocationSearchResult | null {
  return EXACT.get(toSearchKey(normalizeLocationQuery(query))) ?? null
}

/**
 * Ranked suggestions, deduplicated by destination.
 *
 * The dedup is by `key`, not by displayed name: «Գառնի» and «Գեղարդ» are
 * different words for one corridor, and offering both would be two rows that do
 * the same thing.
 */
export function searchLocations(query: string, limit = 8): LocationSearchResult[] {
  const normalized = toSearchKey(normalizeLocationQuery(query))
  if (normalized.length < 2) return []

  const best = new Map<string, { score: number; result: LocationSearchResult }>()
  for (const entry of INDEX) {
    const score = rank(entry, normalized)
    if (score === Number.POSITIVE_INFINITY) continue
    const current = best.get(entry.result.key)
    if (!current || score < current.score) best.set(entry.result.key, { score, result: entry.result })
  }

  return [...best.values()]
    .sort((a, b) => a.score - b.score || a.result.name.localeCompare(b.result.name, 'hy'))
    .slice(0, limit)
    .map((item) => item.result)
}

/**
 * True when two visible results would read the same, so the UI knows to append
 * the marz — «Ակունք — Գեղարքունիք» vs «Ակունք — Կոտայք».
 */
export function needsRegionLabel(results: LocationSearchResult[], result: LocationSearchResult): boolean {
  return results.some((other) => other.key !== result.key && other.name === result.name)
}
