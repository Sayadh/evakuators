import { defineStore } from 'pinia'

/** Currently selected location in the hero search (shared across components) */
export const useLocationStore = defineStore('location', {
  state: () => ({
    selectedRegionSlug: '' as string,
    selectedCitySlug: '' as string,
  }),

  actions: {
    setRegion(slug: string) {
      this.selectedRegionSlug = slug
      this.selectedCitySlug = ''
    },
    setCity(slug: string) {
      this.selectedCitySlug = slug
    },
    reset() {
      this.selectedRegionSlug = ''
      this.selectedCitySlug = ''
    },
  },
})
