<script setup lang="ts">
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import type { VehicleType } from '~/types/enums'
import type { FreeRoute } from '~/types/freeRoute'
import { trackPhoneClick } from '~/utils/analytics'
import { formatDepartureAt } from '~/utils/formatters'
import { getPhoneHref } from '~/utils/formatPhone'
import { formatRouteLocation } from '~/utils/freeRouteLocation'
import { getTowTruckRoute } from '~/utils/routeHelpers'

interface Props {
  route: FreeRoute
}

const props = defineProps<Props>()

const startLabel = computed(() => formatRouteLocation(props.route.startRegionSlug, props.route.startCitySlug))
const endLabel = computed(() => formatRouteLocation(props.route.endRegionSlug, props.route.endCitySlug))
const vehicleLabel = computed(() => VEHICLE_TYPE_LABELS[props.route.driver.vehicleType as VehicleType])
const phoneHref = computed(() => getPhoneHref(props.route.driver.phone))

function onPhoneClick(): void {
  trackPhoneClick(props.route.driver.slug)
}
</script>

<template>
  <article class="route-card">
    <NuxtLink :to="getTowTruckRoute(route.driver.slug)" class="route-card__link">
      <div class="route-card__path">
        <span class="route-card__place">
          <AppIcon name="map-pin" :size="15" />
          {{ startLabel }}
        </span>
        <AppIcon name="arrow-right" :size="16" class="route-card__arrow" />
        <span class="route-card__place">
          <AppIcon name="map-pin" :size="15" />
          {{ endLabel }}
        </span>
      </div>

      <p class="route-card__time">
        <AppIcon name="clock" :size="15" />
        {{ formatDepartureAt(route.departureAt) }}
      </p>

      <p v-if="route.description" class="route-card__note">{{ route.description }}</p>

      <div class="route-card__driver">
        <AppIcon name="user" :size="15" />
        <span>{{ route.driver.name }}</span>
        <span class="route-card__vehicle">· {{ vehicleLabel }}</span>
      </div>
    </NuxtLink>

    <a :href="phoneHref" class="route-card__call" @click="onPhoneClick">
      <AppIcon name="phone" :size="18" />
      Զանգահարել
    </a>
  </article>
</template>

<style scoped lang="scss">
.route-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4);
  transition: box-shadow var(--transition);

  &:hover {
    box-shadow: var(--shadow-md);
  }

  &__link {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    color: var(--color-text);
  }

  &__path {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-weight: 700;
  }

  &__place {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);

    svg {
      color: var(--color-text-muted);
    }
  }

  &__arrow {
    color: var(--color-accent);
    flex-shrink: 0;
  }

  &__time {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    font-size: 0.88rem;
    color: var(--color-text-secondary);

    svg {
      color: var(--color-text-muted);
    }
  }

  &__note {
    margin: 0;
    font-size: 0.88rem;
    color: var(--color-text-secondary);
  }

  &__driver {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.88rem;

    svg {
      color: var(--color-text-muted);
    }
  }

  &__vehicle {
    color: var(--color-text-muted);
  }

  &__call {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-success);
    color: #fff;
    font-weight: 700;
    transition: background var(--transition);

    &:hover {
      background: #178a49;
      color: #fff;
    }
  }
}
</style>
