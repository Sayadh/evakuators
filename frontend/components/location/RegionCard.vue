<script setup lang="ts">
import type { RegionWithStats } from '~/types/location'
import { getRegionRoute } from '~/utils/routeHelpers'

/** Static copy in i18n/locales; place names in i18n/placeNames.ts */
const { t } = useI18n()
const placeName = usePlaceName()

interface Props {
  region: RegionWithStats
}

defineProps<Props>()
</script>

<template>
  <article class="region-card">
    <h3 class="region-card__name">
      <NuxtLinkLocale :to="getRegionRoute(region.slug)" class="region-card__link">
        {{ placeName('region', region.slug, region.name) }}
      </NuxtLinkLocale>
    </h3>
    <ul class="region-card__stats">
      <li><AppIcon name="map-pin" :size="16" /> {{ t('card.cities', region.cityCount) }}</li>
      <li><AppIcon name="truck" :size="16" /> {{ t('card.towTrucks', region.towTruckCount) }}</li>
    </ul>
    <span class="region-card__cta">
      {{ t('card.viewCities') }}
      <AppIcon name="arrow-right" :size="16" />
    </span>
  </article>
</template>

<style scoped lang="scss">
.region-card {
  position: relative;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow var(--transition),
    transform var(--transition);

  &:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  &__name {
    margin-bottom: var(--space-2);
  }

  /* Stretch link over the whole card */
  &__link {
    color: var(--color-text);

    &::after {
      content: '';
      position: absolute;
      inset: 0;
    }
  }

  &__stats {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);

    li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.9rem;
      color: var(--color-text-secondary);

      svg {
        color: var(--color-text-muted);
      }
    }
  }

  &__cta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--color-primary);
  }
}
</style>
