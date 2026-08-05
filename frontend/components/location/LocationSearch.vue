<script setup lang="ts">
const {
  regionOptions,
  cityOptions,
  isLoadingCities,
  selectedRegion,
  selectedCity,
  canSearch,
  submit,
} = useLocationSearch()
</script>

<template>
  <div class="location-search-wrap">
    <!-- Two ways to arrive at the same pages, because they answer different
         questions. The cascade is "show me everything in Kotayk"; the search
         box is «Պտղնի» — a village that is not an option in either select, and
         the name a stranded driver actually knows. -->
    <LocationAutocomplete class="location-search__autocomplete" />

    <p class="location-search__divider"><span>կամ ընտրեք ցանկից</span></p>

    <form class="location-search" @submit.prevent="submit">
      <AppSelect
        v-model="selectedRegion"
        :options="regionOptions"
        label="Մարզ"
        placeholder="Ընտրեք մարզը"
        class="location-search__field"
      />
      <AppSelect
        v-model="selectedCity"
        :options="cityOptions"
        label="Քաղաք / շրջան"
        placeholder="Ընտրեք քաղաքը"
        :disabled="!selectedRegion || isLoadingCities"
        class="location-search__field"
      />
      <AppButton
        type="submit"
        variant="accent"
        size="lg"
        :disabled="!canSearch"
        class="location-search__submit"
      >
        <AppIcon name="search" :size="20" />
        Գտնել էվակուատոր
      </AppButton>
    </form>
  </div>
</template>

<style scoped lang="scss">
.location-search-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.location-search__divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }
}

.location-search {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  background: var(--color-surface);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr auto;
    align-items: end;
    padding: var(--space-5);
  }

  &__submit {
    @media (max-width: 767px) {
      width: 100%;
    }
  }
}
</style>
