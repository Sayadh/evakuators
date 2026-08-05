import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { staticServiceZones } from '~/data/serviceZones'
import type { SelectOption } from '~/types/common'
import { LocationType } from '~/types/enums'
import type { City, District, Region, ServiceZone } from '~/types/location'

/**
 * Pure, synchronous geography lookups over `~/data/*` — **no tow truck data, no
 * network, no async**.
 *
 * ## Why this file exists
 *
 * Most places that need geography need only a *name* or a *route*: the footer's
 * region links, the hero search dropdowns, the registration form's city picker,
 * a service-area chip's link. All of that is static frontend data (see
 * CLAUDE.md § "Core architectural decision").
 *
 * Before this file, those callers went through `regionsService`/`citiesService`/
 * `districtsService` — which fetch **every tow truck in the country** in order to
 * compute a `towTruckCount` the caller then threw away. Because `AppFooter` was
 * one of those callers, *every single page*, including `/about` and `/contact`,
 * downloaded the whole fleet twice on every render. Measured, not theorised.
 *
 * So the rule is now explicit:
 * - need a **name or a route** → use this file (free, synchronous)
 * - need a **count** → use `useRegions()` / `useCities*()` / `useDistricts()`,
 *   which all derive from the one shared `useTowTruckCoverage()` fetch
 */

/**
 * Yerevan is picked like a region in every location picker, but its "cities" are
 * actually its 12 administrative districts (see CLAUDE.md). This slug was
 * previously written as a bare `'yerevan'` literal in four separate files, each
 * with its own local constant — it lives here now, and
 * `utils/freeRouteLocation.ts` re-exports it for its existing callers.
 */
export const YEREVAN_REGION_SLUG = 'yerevan'

const YEREVAN_LABEL = 'Երևան'

/**
 * Shown next to every road corridor so a visitor reading a flat list knows
 * «Գառնի–Գեղարդ» is a route and not a town. One constant, because it appears in
 * the hero cascade, the coverage picker and the zone page heading.
 */
export const SERVICE_ZONE_LABEL = 'ուղղություն'

/** Armenia's 10 marzes, in their canonical order */
export function getStaticRegions(): Region[] {
  return staticRegions
}

/** Yerevan's 12 administrative districts (Yerevan is a pseudo-region — see CLAUDE.md) */
export function getStaticDistricts(): District[] {
  return staticDistricts
}

export function findStaticRegion(regionSlug: string): Region | undefined {
  return staticRegions.find((region) => region.slug === regionSlug)
}

export function findStaticDistrict(districtSlug: string): District | undefined {
  return staticDistricts.find((district) => district.slug === districtSlug)
}

/** Cities belonging to one marz, empty for an unknown slug */
export function getRegionCities(regionSlug: string): City[] {
  const region = findStaticRegion(regionSlug)
  if (!region) return []
  return staticCities.filter((city) => city.regionId === region.id)
}

/**
 * City slugs of one marz. The backend has no geography of its own, so this is
 * also what gets sent as `regionCities` when filtering tow trucks by region.
 */
export function getRegionCitySlugs(regionSlug: string): string[] {
  return getRegionCities(regionSlug).map((city) => city.slug)
}

export function findStaticCity(regionSlug: string, citySlug: string): City | undefined {
  const region = findStaticRegion(regionSlug)
  if (!region) return undefined
  return staticCities.find((city) => city.regionId === region.id && city.slug === citySlug)
}

/**
 * Resolves a bare city slug to the city plus the marz it belongs to — needed
 * because a city's URL is `/regions/<region>/<city>`, so a link can't be built
 * from the city slug alone.
 */
export function findCityLocation(
  citySlug: string,
): { slug: string; name: string; regionSlug: string } | null {
  const city = staticCities.find((item) => item.slug === citySlug)
  if (!city) return null

  const region = staticRegions.find((item) => item.id === city.regionId)
  if (!region) return null

  return { slug: city.slug, name: city.name, regionSlug: region.slug }
}

/* ── Service zones (road corridors) ──────────────────────────────────────── */

/** Road corridors belonging to one marz — empty for Yerevan and unknown slugs */
export function getRegionServiceZones(regionSlug: string): ServiceZone[] {
  const region = findStaticRegion(regionSlug)
  if (!region) return []
  return staticServiceZones.filter((zone) => zone.regionId === region.id)
}

/**
 * Zone slugs of one marz. Sent as `regionZones` when filtering by region, for
 * the same reason `getRegionCitySlugs` is sent as `regionCities`: the backend
 * has no geography and cannot work out which zones belong where.
 */
export function getRegionServiceZoneSlugs(regionSlug: string): string[] {
  return getRegionServiceZones(regionSlug).map((zone) => zone.slug)
}

export function findStaticServiceZone(zoneSlug: string): ServiceZone | undefined {
  return staticServiceZones.find((zone) => zone.slug === zoneSlug)
}

/** Same job as `findCityLocation`, for a zone — its URL also needs the marz */
export function findServiceZoneLocation(
  zoneSlug: string,
): { slug: string; name: string; regionSlug: string } | null {
  const zone = findStaticServiceZone(zoneSlug)
  if (!zone) return null

  const region = staticRegions.find((item) => item.id === zone.regionId)
  if (!region) return null

  return { slug: zone.slug, name: zone.name, regionSlug: region.slug }
}

/**
 * Which kind of area a bare slug refers to.
 *
 * Every form that collects coverage stores a flat `string[]` of slugs and has
 * to label each one before sending it (`serviceAreas[].type`) — registration,
 * the dashboard and the admin approval screen all did this with their own
 * two-branch `findStaticDistrict(slug) ? 'district' : 'city'`, which silently
 * called anything unrecognised a city. With zones in the mix that default would
 * quietly turn «Գառնի–Գեղարդ» into a city and put it in city search results.
 * One function, three callers, no default guess.
 */
export function resolveAreaType(slug: string): LocationType {
  if (findStaticDistrict(slug)) return LocationType.District
  if (findStaticServiceZone(slug)) return LocationType.Route
  return LocationType.City
}

/**
 * Armenian display name for a city, Yerevan district **or** service zone slug,
 * falling back to the raw slug when it matches none.
 *
 * The fallback is deliberately the slug itself and not a title-cased guess: the
 * backend stores raw slugs and cannot resolve names, and inventing a name from
 * the slug string is exactly how "service areas showing raw English slugs"
 * shipped once (see docs/data-model.md § TowTruck.serviceAreas).
 */
export function cityOrDistrictLabel(slug: string): string {
  return (
    staticCities.find((city) => city.slug === slug)?.name ??
    staticDistricts.find((district) => district.slug === slug)?.name ??
    findStaticServiceZone(slug)?.name ??
    slug
  )
}

/* ── Picker options ──────────────────────────────────────────────────────── */

/**
 * Region `<select>` options with Yerevan first.
 *
 * The identical two-step cascade (region list, then "cities" that are districts
 * when Yerevan is selected) was implemented three times — the hero search, the
 * registration form and the free-route picker — each fetching the whole tow truck
 * list to get labels. One implementation, no requests.
 */
export function buildRegionOptions(): SelectOption[] {
  return [
    { value: YEREVAN_REGION_SLUG, label: YEREVAN_LABEL },
    ...staticRegions.map((region) => ({ value: region.slug, label: region.name })),
  ]
}

/**
 * The second step of that cascade: districts for Yerevan, cities otherwise —
 * plus the marz's road corridors, appended after the cities and marked so the
 * two are never confused in a flat `<select>`.
 *
 * The marker is part of the label rather than a separate optgroup because this
 * feeds a plain `AppSelect`, and a caller that needs the structure (the
 * coverage picker, which renders zones as their own sub-group) builds it from
 * `getRegionServiceZones()` directly instead.
 */
export function buildCityOptions(regionSlug: string): SelectOption[] {
  if (!regionSlug) return []

  if (regionSlug === YEREVAN_REGION_SLUG) {
    return staticDistricts.map((district) => ({ value: district.slug, label: district.name }))
  }
  return [
    ...getRegionCities(regionSlug).map((city) => ({ value: city.slug, label: city.name })),
    ...getRegionServiceZones(regionSlug).map((zone) => ({
      value: zone.slug,
      label: `${zone.name} (${SERVICE_ZONE_LABEL})`,
    })),
  ]
}
