import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
import { localizedPlaceName } from '~/i18n/placeNames'
// The Yerevan pseudo-region slug is defined once in `utils/geography.ts`,
// alongside the pickers that use it. Not re-exported from here: Nuxt
// auto-imports everything under utils/, so a second export of the same name
// makes the auto-import resolution ambiguous ("Duplicated imports" build warning).
import { YEREVAN_REGION_SLUG } from './geography'

/**
 * (regionSlug, citySlug) → human label, e.g. "Գավառ, Գեղարքունիք" or
 * "Երևան, Կենտրոն" — translated place names, in the language being read.
 */
export function formatRouteLocation(regionSlug: string, citySlug: string, locale = 'hy'): string {
  const yerevanLabel = localizedPlaceName('city', 'yerevan', 'Երևան', locale)

  if (regionSlug === YEREVAN_REGION_SLUG) {
    const district = staticDistricts.find((item) => item.slug === citySlug)
    return district
      ? `${yerevanLabel}, ${localizedPlaceName('district', district.slug, district.name, locale)}`
      : yerevanLabel
  }

  const city = staticCities.find((item) => item.slug === citySlug)
  const region = staticRegions.find((item) => item.slug === regionSlug)
  const cityName = city ? localizedPlaceName('city', city.slug, city.name, locale) : undefined
  const regionName = region ? localizedPlaceName('region', region.slug, region.name, locale) : undefined
  if (cityName && regionName) return `${cityName}, ${regionName}`
  return cityName ?? regionName ?? citySlug
}
