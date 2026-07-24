import { citiesService, districtsService } from '~/services'
import type { SelectOption } from '~/types/common'
import type { RegionWithStats } from '~/types/location'
import { YEREVAN_REGION_SLUG } from '~/utils/freeRouteLocation'

/**
 * A single region + city/district picker, following the same Yerevan-aware
 * cascading pattern as register.vue's "Տարածքներ" section — but for a single
 * location instead of a multi-select. Used twice per free route (start/end).
 */
export function useLocationPicker(regions: Ref<RegionWithStats[]>) {
  const regionSlug = ref('')
  const citySlug = ref('')
  const cityOptions = ref<SelectOption[]>([])

  /** Set right before a programmatic setValue() so the watcher below doesn't clobber it */
  let suppressNextReset = false

  const regionOptions = computed<SelectOption[]>(() => [
    { value: YEREVAN_REGION_SLUG, label: 'Երևան' },
    ...regions.value.map((region) => ({ value: region.slug, label: region.name })),
  ])

  async function loadCityOptions(slug: string): Promise<SelectOption[]> {
    if (!slug) return []

    if (slug === YEREVAN_REGION_SLUG) {
      const districts = await districtsService.getDistricts()
      return districts.map((district) => ({ value: district.slug, label: district.name }))
    }

    const cities = await citiesService.getCitiesByRegionSlug(slug)
    return cities.map((city) => ({ value: city.slug, label: city.name }))
  }

  // User picking a new region always clears the city — normal interactive flow
  watch(regionSlug, async (slug) => {
    if (suppressNextReset) {
      suppressNextReset = false
      return
    }
    citySlug.value = ''
    cityOptions.value = await loadCityOptions(slug)
  })

  /** Pre-fills both fields at once (edit mode) without the watcher wiping citySlug */
  async function setValue(nextRegionSlug: string, nextCitySlug: string): Promise<void> {
    cityOptions.value = await loadCityOptions(nextRegionSlug)
    suppressNextReset = true
    regionSlug.value = nextRegionSlug
    citySlug.value = nextCitySlug
    await nextTick()
    // If the value didn't actually change, the watcher never fired to consume the flag
    suppressNextReset = false
  }

  function reset(): void {
    regionSlug.value = ''
    citySlug.value = ''
    cityOptions.value = []
  }

  return { regionSlug, citySlug, regionOptions, cityOptions, setValue, reset }
}
