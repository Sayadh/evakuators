<script setup lang="ts">
import { POPULAR_LOCATIONS, type PopularLocation } from '~/constants/popularLocations'
import { regionLabel } from '~/utils/geography'

/** Static copy lives in i18n/locales — see nuxt.config's i18n block */
const { t } = useI18n()
const placeName = usePlaceName()

/** The town's own name, in the language being read */
function nameOf(location: PopularLocation): string {
  return placeName(location.kind, location.slug, location.slug)
}

/**
 * The grey line under the name: which marz this is in, or «Մայրաքաղաք» for
 * Yerevan, which is in none. Derived rather than stored — see
 * `constants/popularLocations.ts`.
 */
function hintOf(location: PopularLocation): string {
  if (!location.regionSlug) return t('popular.capital')
  return t('popular.regionHint', {
    region: placeName('region', location.regionSlug, regionLabel(location.regionSlug)),
  })
}
</script>

<template>
  <section class="popular section" aria-labelledby="popular-title">
    <div class="container">
      <h2 id="popular-title" class="section-title">{{ t('home.popularTitle') }}</h2>
      <div class="popular__grid">
        <NuxtLinkLocale
          v-for="location in POPULAR_LOCATIONS"
          :key="location.to"
          :to="location.to"
          class="popular__card"
        >
          <AppIcon name="map-pin" :size="18" class="popular__icon" />
          <span class="popular__name">{{ nameOf(location) }}</span>
          <span class="popular__hint">{{ hintOf(location) }}</span>
        </NuxtLinkLocale>
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
