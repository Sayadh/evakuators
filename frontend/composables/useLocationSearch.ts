import { citiesService, districtsService } from '~/services'
import { useLocationStore } from '~/stores/location'
import type { SelectOption } from '~/types/common'
import { trackLocationSearch } from '~/utils/analytics'
import { getCityRoute, getDistrictRoute, getRegionRoute, getYerevanRoute } from '~/utils/routeHelpers'

const YEREVAN_SLUG = 'yerevan'

/** Region + city cascade used by the hero search form */
export function useLocationSearch() {
  const locationStore = useLocationStore()
  const router = useRouter()

  const { data: regions } = useRegions()
  const cityOptions = ref<SelectOption[]>([])
  const isLoadingCities = ref(false)

  const regionOptions = computed<SelectOption[]>(() => [
    { value: YEREVAN_SLUG, label: 'Երևան' },
    ...regions.value.map((region) => ({ value: region.slug, label: region.name })),
  ])

  const selectedRegion = computed({
    get: () => locationStore.selectedRegionSlug,
    set: (value: string) => locationStore.setRegion(value),
  })

  const selectedCity = computed({
    get: () => locationStore.selectedCitySlug,
    set: (value: string) => locationStore.setCity(value),
  })

  watch(
    selectedRegion,
    async (regionSlug) => {
      cityOptions.value = []
      if (!regionSlug) return

      isLoadingCities.value = true
      try {
        if (regionSlug === YEREVAN_SLUG) {
          const districts = await districtsService.getDistricts()
          cityOptions.value = districts.map((district) => ({
            value: district.slug,
            label: district.name,
          }))
        } else {
          const cities = await citiesService.getCitiesByRegionSlug(regionSlug)
          cityOptions.value = cities.map((city) => ({ value: city.slug, label: city.name }))
        }
      } finally {
        isLoadingCities.value = false
      }
    },
    { immediate: true },
  )

  const canSearch = computed(() => selectedRegion.value !== '')

  function getSearchRoute(): string {
    const regionSlug = selectedRegion.value
    const citySlug = selectedCity.value

    if (regionSlug === YEREVAN_SLUG) {
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
