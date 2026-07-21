<script setup lang="ts">
import { POPULAR_LOCATIONS } from '~/constants/popularLocations'
</script>

<template>
  <section class="popular section" aria-labelledby="popular-title">
    <div class="container">
      <h2 id="popular-title" class="section-title">Հաճախ որոնվող տարածքներ</h2>
      <div class="popular__grid">
        <NuxtLink
          v-for="location in POPULAR_LOCATIONS"
          :key="location.to"
          :to="location.to"
          class="popular__card"
        >
          <AppIcon name="map-pin" :size="18" class="popular__icon" />
          <span class="popular__name">{{ location.name }}</span>
          <span class="popular__hint">{{ location.hint }}</span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.popular {
  &__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);

    @media (min-width: 768px) {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  &__card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    background: var(--color-surface);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    transition:
      box-shadow var(--transition),
      transform var(--transition);

    &:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
  }

  &__icon {
    color: var(--color-accent-dark);
  }

  &__name {
    font-weight: 700;
    color: var(--color-text);
  }

  &__hint {
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }
}
</style>
