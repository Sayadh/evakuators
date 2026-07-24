import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { staticRegions } from '~/data/regions'

/** Same pseudo-region convention used in register.vue: Yerevan is picked like
 * a region, but its "cities" are actually districts. */
export const YEREVAN_REGION_SLUG = 'yerevan'
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
