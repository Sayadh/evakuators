import type { SelectOption } from '~/types/common'
import { buildCityOptions, buildRegionOptions } from '~/utils/geography'

/**
 * A single region + city/district picker, following the same Yerevan-aware
 * cascading pattern as register.vue's "Տարածքներ" section — but for one location
 * instead of a multi-select. Used twice per free route (start/end).
 *
 * Fully synchronous: options come from static geography (`utils/geography.ts`).
 * It used to take the region list as an argument and load city options through
 * `citiesService`/`districtsService`, each of which fetched every tow truck in the
 * country to compute counts a `<select>` never displays — and there are two
 * pickers per free-route form.
 */
export function useLocationPicker() {
  const regionSlug = ref('')
  const citySlug = ref('')

  /** Set right before a programmatic setValue() so the watcher below doesn't clobber it */
  let suppressNextReset = false

  const regionOptions = computed<SelectOption[]>(() => buildRegionOptions())
  const cityOptions = computed<SelectOption[]>(() => buildCityOptions(regionSlug.value))

  // User picking a new region always clears the city — normal interactive flow
  watch(regionSlug, () => {
    if (suppressNextReset) {
      suppressNextReset = false
      return
    }
    citySlug.value = ''
  })

  /**
   * Pre-fills both fields at once (edit mode) without the watcher wiping
   * citySlug. Still async so callers can `await` it and know the watcher has
   * settled before reading the values back.
   */
  async function setValue(nextRegionSlug: string, nextCitySlug: string): Promise<void> {
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
  }

  return { regionSlug, citySlug, regionOptions, cityOptions, setValue, reset }
}
