import { YEREVAN_REGION_SLUG } from '~/utils/geography'

/**
 * Turns the admin tow-trucks list's marz/settlement filter selects into the
 * params `adminRepository.listTowTrucks` expects.
 *
 * Pulled out of `pages/admin/index.vue` into its own testable function for
 * the same reason `syncVehicleDependentFields`/`matchesFilters` are: three
 * branches with an easy way to get one wrong (send a `citySlug` a `regionSlug`
 * doesn't match, or send Yerevan's district under the wrong field) is exactly
 * the kind of logic a page component hides from a test.
 *
 * Branches exactly like `useLocationSearch.getSearchRoute()` does for the
 * hero search: Yerevan's "cities" are districts and carry no `regionSlug` of
 * their own, so picking Yerevan with no settlement means "yerevan: true"
 * rather than a slug to match — see backend `AdminTowTrucksQuery.yerevan`.
 */
export function towTruckLocationParams(
  regionSlug: string,
  citySlug: string,
): { regionSlug?: string; citySlug?: string; districtSlug?: string; yerevan?: boolean } {
  if (!regionSlug) return {}
  if (regionSlug === YEREVAN_REGION_SLUG) {
    return citySlug ? { districtSlug: citySlug } : { yerevan: true }
  }
  return citySlug ? { regionSlug, citySlug } : { regionSlug }
}
