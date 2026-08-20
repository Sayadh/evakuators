import { defineStore } from 'pinia'
import type { ServiceType, SortOption, VehicleType } from '~/types/enums'
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
    setVehicleType(vehicleType: VehicleType | null) {
      this.vehicleType = this.vehicleType === vehicleType ? null : vehicleType
    },
    toggleService(service: ServiceType) {
      this.services = this.services.includes(service)
        ? this.services.filter((item) => item !== service)
        : [...this.services, service]
    },
    setCapacity(capacity: string | null) {
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
