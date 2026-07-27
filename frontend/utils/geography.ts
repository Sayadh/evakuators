import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import type { SelectOption } from '~/types/common'
import type { City, District, Region } from '~/types/location'

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
 *   which all derive from the one shared `useAllTowTrucks()` fetch
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

/**
 * Armenian display name for a city **or** Yerevan district slug, falling back to
 * the raw slug when it matches neither.
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

/** The second step of that cascade: districts for Yerevan, cities otherwise */
export function buildCityOptions(regionSlug: string): SelectOption[] {
  if (!regionSlug) return []

  if (regionSlug === YEREVAN_REGION_SLUG) {
    return staticDistricts.map((district) => ({ value: district.slug, label: district.name }))
  }
  return getRegionCities(regionSlug).map((city) => ({ value: city.slug, label: city.name }))
}
