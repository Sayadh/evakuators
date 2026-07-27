import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'
// The Yerevan pseudo-region slug is defined once in `utils/geography.ts`,
// alongside the pickers that use it. Not re-exported from here: Nuxt
// auto-imports everything under utils/, so a second export of the same name
// makes the auto-import resolution ambiguous ("Duplicated imports" build warning).
import { YEREVAN_REGION_SLUG } from './geography'

const YEREVAN_LABEL = 'Երևան'

/** (regionSlug, citySlug) → human label, e.g. "Գավառ, Գեղարքունիք" or "Երևան, Կենտրոն" */
export function formatRouteLocation(regionSlug: string, citySlug: string): string {
  if (regionSlug === YEREVAN_REGION_SLUG) {
    const district = staticDistricts.find((item) => item.slug === citySlug)
    return district ? `${YEREVAN_LABEL}, ${district.name}` : YEREVAN_LABEL
  }

  const city = staticCities.find((item) => item.slug === citySlug)
  const region = staticRegions.find((item) => item.slug === regionSlug)
  if (city && region) return `${city.name}, ${region.name}`
  return city?.name ?? region?.name ?? citySlug
}
