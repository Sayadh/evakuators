import { defineStore } from 'pinia'
import type { CapacityOption, ServiceType, SortOption } from '~/types/enums'
import type { TowTruckFilterState } from '~/types/filters'
import { countActiveFilters, createDefaultFilterState } from '~/utils/towTruckFilters'

export const useTowTruckFiltersStore = defineStore('towTruckFilters', {
  state: (): TowTruckFilterState => createDefaultFilterState(),

  getters: {
    activeFiltersCount: (state): number => countActiveFilters(state),
  },

  actions: {
    toggleWorks24Hours() {
      this.works24Hours = !this.works24Hours
    },
    toggleManipulator() {
      this.manipulator = !this.manipulator
    },
    toggleService(service: ServiceType) {
      this.services = this.services.includes(service)
        ? this.services.filter((item) => item !== service)
        : [...this.services, service]
    },
    setCapacity(capacity: CapacityOption | null) {
      this.capacity = this.capacity === capacity ? null : capacity
    },
    setSort(sort: SortOption) {
      this.sort = sort
    },
    replace(state: TowTruckFilterState) {
      Object.assign(this, state)
    },
    reset() {
      const { sort, ...defaults } = createDefaultFilterState()
      Object.assign(this, defaults)
      this.sort = sort
    },
  },
})
