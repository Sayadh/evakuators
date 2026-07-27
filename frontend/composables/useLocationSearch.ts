import { useLocationStore } from '~/stores/location'
import type { SelectOption } from '~/types/common'
import { trackLocationSearch } from '~/utils/analytics'
import { buildCityOptions, buildRegionOptions, YEREVAN_REGION_SLUG } from '~/utils/geography'
import { getCityRoute, getDistrictRoute, getRegionRoute, getYerevanRoute } from '~/utils/routeHelpers'

/**
 * Region + city cascade used by the hero search form.
 *
 * Dropdown options are labels only, so everything here comes from static
 * geography and the cascade is synchronous — no request, no loading state to
 * race. It used to call `useRegions()` plus `citiesService`/`districtsService`,
 * each of which fetches the entire tow truck list to compute counts the
 * `<select>` never shows; on the homepage that alone was one of the duplicate
 * `GET /tow-trucks` calls.
 */
export function useLocationSearch() {
  const locationStore = useLocationStore()
  const router = useRouter()

  const regionOptions = computed<SelectOption[]>(() => buildRegionOptions())

  const selectedRegion = computed({
    get: () => locationStore.selectedRegionSlug,
    set: (value: string) => locationStore.setRegion(value),
  })

  const selectedCity = computed({
    get: () => locationStore.selectedCitySlug,
    set: (value: string) => locationStore.setCity(value),
  })

  /**
   * Purely computed now — the previous async watcher existed only because the
   * lookups used to hit the network.
   */
  const cityOptions = computed<SelectOption[]>(() => buildCityOptions(selectedRegion.value))

  /**
   * Kept for API compatibility with `LocationSearch.vue`, which shows a
   * "loading…" state on the city select. Options are resolved synchronously now,
   * so there is never a pending moment.
   */
  const isLoadingCities = computed(() => false)

  const canSearch = computed(() => selectedRegion.value !== '')

  function getSearchRoute(): string {
    const regionSlug = selectedRegion.value
    const citySlug = selectedCity.value

    if (regionSlug === YEREVAN_REGION_SLUG) {
      return citySlug ? getDistrictRoute(citySlug) : getYerevanRoute()
    }
    return citySlug ? getCityRoute(regionSlug, citySlug) : getRegionRoute(regionSlug)
  }

  function submit(): void {
    if (!canSearch.value) return
    trackLocationSearch(selectedRegion.value, selectedCity.value || undefined)
    router.push(getSearchRoute())
  }

  return {
    regionOptions,
    cityOptions,
    isLoadingCities,
    selectedRegion,
    selectedCity,
    canSearch,
    submit,
  }
}
