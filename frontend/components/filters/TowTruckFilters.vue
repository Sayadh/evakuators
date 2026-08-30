<script setup lang="ts">
import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import { SERVICE_CATEGORIES } from '~/constants/services'
import { CAPACITY_RANGE_OPTIONS, GENERAL_LISTING_VEHICLE_TYPE_OPTIONS } from '~/constants/vehicles'
import type { ServiceType } from '~/types/enums'

const store = useTowTruckFiltersStore()

function onServicesUpdate(services: ServiceType[]): void {
  store.services = services
}
</script>

<template>
  <div class="filters">
    <fieldset class="filters__group">
      <legend class="filters__legend">Հասանելիություն</legend>
      <AppCheckbox
        :model-value="store.works24Hours"
        label="Աշխատում է 24/7"
        @update:model-value="store.toggleWorks24Hours()"
      />
    </fieldset>

    <fieldset class="filters__group">
      <legend class="filters__legend">Տեխնիկա</legend>
      <AppCheckbox
        v-for="option in GENERAL_LISTING_VEHICLE_TYPE_OPTIONS"
        :key="option.value"
        :model-value="store.vehicleType === option.value"
        :label="option.label"
        @update:model-value="store.setVehicleType(option.value)"
      />
    </fieldset>

    <fieldset class="filters__group">
      <legend class="filters__legend">Բեռնատարողություն</legend>
      <AppCheckbox
        v-for="option in CAPACITY_RANGE_OPTIONS"
        :key="option.value"
        :model-value="store.capacity === option.value"
        :label="option.label"
        @update:model-value="store.setCapacity(option.value)"
      />
    </fieldset>

    <!-- Its own group rather than a fifth box inside «Տեխնիկա» above: that one
         is a pick-one list of vehicle types, and a boolean sitting among them
         reads as a sixth type. This is equipment the truck either has or does
         not, which is the same shape as «Աշխատում է 24/7». -->
    <fieldset class="filters__group">
      <legend class="filters__legend">Հագեցվածություն</legend>
      <AppCheckbox
        :model-value="store.wheelSkates"
        label="Առկա են անիվային ռոլիկներ"
        @update:model-value="store.toggleWheelSkates()"
      />
      <AppCheckbox
        :model-value="store.doubleDeck"
        label="2-հարկանի էվակուատոր"
        @update:model-value="store.toggleDoubleDeck()"
      />
      <AppCheckbox
        :model-value="store.towHitch"
        label="Ունի կցորդ (կարող է տանել նաև 2 մեքենա)"
        @update:model-value="store.toggleTowHitch()"
      />
    </fieldset>

    <fieldset class="filters__group">
      <legend class="filters__legend">Ծառայություններ</legend>
      <ServiceCategoryPicker
        :model-value="store.services"
        :categories="SERVICE_CATEGORIES"
        mode="filter"
        @update:model-value="onServicesUpdate"
      />
    </fieldset>

    <AppButton
      v-if="store.activeFiltersCount > 0"
      variant="ghost"
      size="sm"
      block
      @click="store.reset()"
    >
      Մաքրել ֆիլտրերը ({{ store.activeFiltersCount }})
    </AppButton>
  </div>
</template>

<style scoped lang="scss">
.filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__group {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__legend {
    font-weight: 700;
    font-size: 0.95rem;
    margin-bottom: var(--space-2);
    padding: 0;
  }
}
</style>
