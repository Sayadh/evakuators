<script setup lang="ts">
import { citiesService } from '~/services'
import { LocationType } from '~/types/enums'
import type { ServiceArea } from '~/types/towTruck'
import { getCityRoute, getDistrictRoute } from '~/utils/routeHelpers'

interface Props {
  areas: ServiceArea[]
}

const props = defineProps<Props>()

/** slug → regionSlug map so city chips can link to their pages */
const { data: allCities } = useAsyncData('all-cities', () => citiesService.getAllCities(), {
  default: () => [],
})

function getAreaRoute(area: ServiceArea): string | null {
  if (area.type === LocationType.District) return getDistrictRoute(area.slug)
  if (area.type === LocationType.City) {
    const match = allCities.value.find((cityItem) => cityItem.slug === area.slug)
    return match ? getCityRoute(match.regionSlug, match.slug) : null
  }
  return null
}
</script>

<template>
  <section class="truck-areas" aria-labelledby="truck-areas-title">
    <h2 id="truck-areas-title" class="truck-areas__title">Սպասարկվող տարածքներ</h2>
    <ul class="truck-areas__list">
      <li v-for="area in props.areas" :key="`${area.type}-${area.slug}`">
        <NuxtLink v-if="getAreaRoute(area)" :to="getAreaRoute(area)!" class="truck-areas__chip">
          <AppIcon name="map-pin" :size="14" />
          {{ area.name }}
        </NuxtLink>
        <span v-else class="truck-areas__chip truck-areas__chip--static">
          <AppIcon name="map-pin" :size="14" />
          {{ area.name }}
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.truck-areas {
  &__title {
    margin-bottom: var(--space-4);
  }

  &__list {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.9rem;
    font-weight: 600;
    transition: background var(--transition);

    &:hover:not(&--static) {
      background: rgba(20, 48, 79, 0.1);
    }

    svg {
      color: var(--color-text-muted);
    }
  }
}
</style>
