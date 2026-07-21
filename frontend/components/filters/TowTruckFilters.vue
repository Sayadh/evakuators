<script setup lang="ts">
import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import { FILTERABLE_SERVICES, SERVICE_LABELS } from '~/constants/services'
import { CAPACITY_OPTIONS } from '~/constants/vehicles'

const store = useTowTruckFiltersStore()
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
      <legend class="filters__legend">Ծառայություններ</legend>
      <AppCheckbox
        v-for="service in FILTERABLE_SERVICES"
        :key="service"
        :model-value="store.services.includes(service)"
        :label="SERVICE_LABELS[service]"
        @update:model-value="store.toggleService(service)"
      />
    </fieldset>

    <fieldset class="filters__group">
      <legend class="filters__legend">Տեխնիկա</legend>
      <AppCheckbox
        :model-value="store.manipulator"
        label="Մանիպուլյատորով էվակուատոր"
        @update:model-value="store.toggleManipulator()"
      />
    </fieldset>

    <fieldset class="filters__group">
      <legend class="filters__legend">Բեռնատարողություն</legend>
      <AppCheckbox
        v-for="option in CAPACITY_OPTIONS"
        :key="option.value"
        :model-value="store.capacity === option.value"
        :label="option.label"
        @update:model-value="store.setCapacity(option.value)"
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
