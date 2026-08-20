<script setup lang="ts">
import { LocationType } from '~/types/enums'
import type { ServiceArea } from '~/types/towTruck'
import { findCityLocation } from '~/utils/geography'
import { getCityRoute, getDistrictRoute, getRegionRoute } from '~/utils/routeHelpers'

interface Props {
  areas: ServiceArea[]
  /**
   * «Ամբողջ Հայաստան» — one statement instead of a list.
   *
   * Rendered as a single line rather than as eleven marz chips, because that is
   * what the driver actually answered: eleven chips would read as "these
   * eleven, checked one by one", and the two are different claims (see
   * `TowTruck.servesAllArmenia`). The base still shows separately, so «where
   * are you» and «where will you go» stay distinguishable.
   */
  servesAllArmenia?: boolean
}

const props = withDefaults(defineProps<Props>(), { servesAllArmenia: false })

/**
 * A city's URL is /regions/<region>/<city>, so a chip needs the city's marz —
 * resolved from static data. This previously fetched every tow truck (via
 * `citiesService.getAllCities()`) just to read a slug → regionSlug mapping that
 * never depended on truck data at all.
 */
function getAreaRoute(area: ServiceArea): string | null {
  if (area.type === LocationType.District) return getDistrictRoute(area.slug)
  // A marz-wide area links to the marz page — the slug IS the region, with no
  // lookup needed. Only an uncapped driver has one (see ServiceAreaDto).
  if (area.type === LocationType.Region) return getRegionRoute(area.slug)
  if (area.type === LocationType.City) {
    const city = findCityLocation(area.slug)
    return city ? getCityRoute(city.regionSlug, city.slug) : null
  }
  return null
}
</script>

<template>
  <section class="truck-areas" aria-labelledby="truck-areas-title">
    <h2 id="truck-areas-title" class="truck-areas__title">Սպասարկվող տարածքներ</h2>
    <p v-if="props.servesAllArmenia" class="truck-areas__all">
      <AppIcon name="map-pin" :size="16" />
      Ամբողջ Հայաստան
    </p>
    <ul v-else class="truck-areas__list">
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

  &__all {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;

    svg {
      color: var(--color-text-muted);
    }
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
