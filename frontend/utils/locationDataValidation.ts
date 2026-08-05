import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { staticServiceZones } from '~/data/serviceZones'
import { staticSettlements } from '~/data/settlement'
import { normalizeLocationQuery } from './locationSearch'

/**
 * Structural checks over the static location data.
 *
 * These files are hand-maintained and referenced by id across four datasets —
 * a settlement points at a city and sometimes at a corridor, both of which must
 * exist and be in the same marz. A typo there does not fail the build; it
 * produces a link to nowhere, or a search result that quietly disappears. This
 * turns that class of mistake into a failing test.
 *
 * Two severities, deliberately:
 * - `errors` are broken references or contradictions. They must be zero.
 * - `conflicts` are real, known ambiguities in the source data (a village and a
 *   town sharing a name). They are NOT failures — they are reported so nobody
 *   "fixes" them by renaming, and so the disambiguation rules stay honest.
 */

export interface LocationDataReport {
  errors: string[]
  /** Same normalized term reaching more than one destination */
  ambiguities: string[]
  /** A settlement slug that equals a city slug */
  slugConflicts: string[]
}

export function validateLocationData(): LocationDataReport {
  const errors: string[] = []
  const ambiguities: string[] = []
  const slugConflicts: string[] = []

  const regionById = new Map(staticRegions.map((region) => [region.id, region]))
  const cityById = new Map(staticCities.map((city) => [city.id, city]))
  const zoneById = new Map(staticServiceZones.map((zone) => [zone.id, zone]))

  const duplicateIds = (label: string, ids: number[]): void => {
    const seen = new Set<number>()
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label}: duplicate id ${id}`)
      seen.add(id)
    }
  }
  duplicateIds('settlements', staticSettlements.map((s) => s.id))
  duplicateIds('cities', staticCities.map((c) => c.id))
  duplicateIds('serviceZones', staticServiceZones.map((z) => z.id))
  duplicateIds('regions', staticRegions.map((r) => r.id))

  // Canonical slugs share one namespace: they all appear at /regions/:region/:slug
  const citySlugs = new Set(staticCities.map((c) => c.slug))
  const districtSlugs = new Set(staticDistricts.map((d) => d.slug))
  for (const zone of staticServiceZones) {
    if (citySlugs.has(zone.slug)) errors.push(`zone/city slug collision: ${zone.slug}`)
    if (districtSlugs.has(zone.slug)) errors.push(`zone/district slug collision: ${zone.slug}`)
  }

  const seenSettlementSlugs = new Set<string>()
  for (const settlement of staticSettlements) {
    const label = `${settlement.name} (#${settlement.id})`

    if (!regionById.has(settlement.regionId)) {
      errors.push(`${label}: unknown regionId ${settlement.regionId}`)
      continue
    }

    // Settlement slugs are unique per marz, not nationwide — there really are
    // two Ակունք and two Թեղուտ.
    const scoped = `${settlement.regionId}:${settlement.slug}`
    if (seenSettlementSlugs.has(scoped)) errors.push(`${label}: duplicate slug in region (${scoped})`)
    seenSettlementSlugs.add(scoped)

    const city = cityById.get(settlement.targetCityId)
    if (!city) errors.push(`${label}: unknown targetCityId ${settlement.targetCityId}`)
    else if (city.regionId !== settlement.regionId) {
      errors.push(`${label}: targetCity "${city.name}" is in region ${city.regionId}, settlement in ${settlement.regionId}`)
    }

    if (settlement.targetServiceZoneId !== undefined) {
      const zone = zoneById.get(settlement.targetServiceZoneId)
      if (!zone) errors.push(`${label}: unknown targetServiceZoneId ${settlement.targetServiceZoneId}`)
      else {
        if (zone.regionId !== settlement.regionId) {
          errors.push(`${label}: targetZone "${zone.name}" is in region ${zone.regionId}, settlement in ${settlement.regionId}`)
        }
        // A redirect to a URL identical to the source is a loop, not a move.
        if (zone.slug === settlement.slug) errors.push(`${label}: redirects to its own slug`)
      }
    }

    if (settlement.seoMode === 'redirect' && settlement.targetServiceZoneId === undefined) {
      errors.push(`${label}: seoMode "redirect" without targetServiceZoneId`)
    }
    if (settlement.seoMode === 'landing' && settlement.indexable === true && !settlement.seo) {
      errors.push(`${label}: indexable landing without seo content`)
    }

    if (citySlugs.has(settlement.slug)) {
      const city = staticCities.find((item) => item.slug === settlement.slug)!
      slugConflicts.push(
        `${settlement.name}: settlement "${settlement.slug}" (region ${settlement.regionId}) ` +
          `vs city "${city.name}" (region ${city.regionId})` +
          (city.regionId === settlement.regionId ? ' — SAME REGION' : ''),
      )
    }
  }

  // Ambiguity: one typed term, more than one destination. Not an error — it is
  // what the region label in the autocomplete exists for.
  const byTerm = new Map<string, Set<string>>()
  const add = (term: string, key: string): void => {
    const normalized = normalizeLocationQuery(term)
    if (!normalized) return
    if (!byTerm.has(normalized)) byTerm.set(normalized, new Set())
    byTerm.get(normalized)!.add(key)
  }
  for (const city of staticCities) {
    add(city.name, `city:${city.slug}`)
    add(city.slug, `city:${city.slug}`)
  }
  for (const district of staticDistricts) {
    add(district.name, `district:${district.slug}`)
    add(district.slug, `district:${district.slug}`)
  }
  for (const zone of staticServiceZones) {
    add(zone.name, `zone:${zone.slug}`)
    add(zone.slug, `zone:${zone.slug}`)
  }
  for (const settlement of staticSettlements) {
    const zone = settlement.targetServiceZoneId ? zoneById.get(settlement.targetServiceZoneId) : undefined
    const key = zone ? `zone:${zone.slug}` : `settlement:${settlement.regionId}:${settlement.slug}`
    add(settlement.name, key)
    add(settlement.slug, key)
    for (const alias of settlement.aliases) add(alias, key)
  }
  for (const [term, keys] of byTerm) {
    if (keys.size > 1) ambiguities.push(`"${term}" → ${[...keys].join(' | ')}`)
  }

  return { errors, ambiguities, slugConflicts }
}
