<script setup lang="ts">
import { useTowTruckFiltersStore } from '~/stores/towTruckFilters'
import { SORT_OPTIONS } from '~/constants/sort'
import type { SortOption } from '~/types/enums'

const store = useTowTruckFiltersStore()

const sortValue = computed({
  get: () => store.sort as string,
  set: (value: string) => store.setSort(value as SortOption),
})

const options = SORT_OPTIONS.map((option) => ({ value: option.value as string, label: option.label }))
</script>

<template>
  <div class="sort">
    <span class="sort__label">Դասավորել՝</span>
    <AppSelect v-model="sortValue" :options="options" class="sort__select" />
  </div>
</template>

<style scoped lang="scss">
.sort {
  display: flex;
  align-items: center;
  gap: var(--space-2);

  &__label {
    font-size: 0.9rem;
    color: var(--color-text-secondary);
    white-space: nowrap;

    @media (max-width: 479px) {
      display: none;
    }
  }

  &__select {
    min-width: 200px;
  }
}
</style>
