<script setup lang="ts">
import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import { GENERAL_LISTING_VEHICLE_TYPE_OPTIONS } from '~/constants/vehicles'

const store = useTowTruckFiltersStore()

const { t } = useI18n()
const { serviceLabel, vehicleTypeLabel, capacityRangeLabel } = useCatalogLabels()

interface ActiveChip {
  key: string
  label: string
  remove: () => void
}

const chips = computed<ActiveChip[]>(() => {
  const result: ActiveChip[] = []

  if (store.works24Hours)
    result.push({ key: '24h', label: '24/7', remove: () => store.toggleWorks24Hours() })

  if (store.wheelSkates)
    result.push({
      key: 'wheelSkates',
      label: t('filters.chipWheelSkates'),
      remove: () => store.toggleWheelSkates(),
    })

  if (store.doubleDeck)
    result.push({
      key: 'doubleDeck',
      label: t('filters.chipDoubleDeck'),
      remove: () => store.toggleDoubleDeck(),
    })

  if (store.towHitch)
    result.push({
      key: 'towHitch',
      label: t('filters.chipTowHitch'),
      remove: () => store.toggleTowHitch(),
    })

  if (store.vehicleType !== null) {
    const option = GENERAL_LISTING_VEHICLE_TYPE_OPTIONS.find(
      (item) => item.value === store.vehicleType,
    )
    if (option)
      result.push({
        key: 'vehicleType',
        label: vehicleTypeLabel(option.value),
        remove: () => store.setVehicleType(null),
      })
  }

  if (store.capacity !== null) {
    const label = capacityRangeLabel(store.capacity)
    if (label)
      result.push({
        key: 'capacity',
        label,
        remove: () => store.setCapacity(null),
      })
  }

  for (const service of store.services) {
    result.push({
      key: `service-${service}`,
      label: serviceLabel(service),
      remove: () => store.toggleService(service),
    })
  }

  return result
})
</script>

<template>
  <div v-if="chips.length > 0" class="active-filters" role="list" :aria-label="t('filters.activeLabel')">
    <button
      v-for="chip in chips"
      :key="chip.key"
      type="button"
      class="active-filters__chip"
      role="listitem"
      :aria-label="t('filters.removeChip', { label: chip.label })"
      @click="chip.remove()"
    >
      {{ chip.label }}
      <AppIcon name="close" :size="14" />
    </button>
    <button type="button" class="active-filters__clear" @click="store.reset()">
      {{ t('filters.clearAll') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.active-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text);
    cursor: pointer;
    transition: border-color var(--transition);

    &:hover {
      border-color: var(--color-danger);
      color: var(--color-danger);
    }
  }

  &__clear {
    border: none;
    background: none;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    cursor: pointer;
    text-decoration: underline;
    padding: var(--space-1);

    &:hover {
      color: var(--color-danger);
    }
  }
}
</style>
