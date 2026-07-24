<script setup lang="ts">
import type { TowTruck } from '~/types/towTruck'
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { formatCapacity } from '~/utils/formatters'
import { formatStartingPrice } from '~/utils/formatPrice'
import { getTowTruckRoute } from '~/utils/routeHelpers'

interface Props {
  towTruck: TowTruck
}

const props = defineProps<Props>()

const { phoneHref, whatsappUrl, onPhoneClick, onWhatsAppClick } = usePhoneActions(
  () => props.towTruck,
)

const displayName = computed(() => props.towTruck.companyName ?? props.towTruck.driverName)

const mainAreas = computed(() =>
  props.towTruck.serviceAreas
    .slice(0, 3)
    .map((area) => area.name)
    .join(', '),
)
</script>

<template>
  <article class="truck-card">
    <div class="truck-card__media">
      <NuxtLink :to="getTowTruckRoute(towTruck.slug)" tabindex="-1">
        <NuxtImg
          :src="towTruck.images[0]"
          :alt="`${displayName} — ${towTruck.vehicle.brand} ${towTruck.vehicle.model} էվակուատոր`"
          class="truck-card__image"
          width="400"
          height="225"
          loading="lazy"
          format="webp"
        />
      </NuxtLink>
    </div>

    <div class="truck-card__body">
      <h3 class="truck-card__name">
        <NuxtLink :to="getTowTruckRoute(towTruck.slug)">{{ displayName }}</NuxtLink>
      </h3>

      <ul class="truck-card__specs">
        <li>
          <AppIcon name="truck" :size="15" />
          {{ towTruck.vehicle.brand }} {{ towTruck.vehicle.model }} ·
          {{ VEHICLE_TYPE_LABELS[towTruck.vehicle.type] }}
        </li>
        <li>
          <AppIcon name="weight" :size="15" />
          Մինչև {{ formatCapacity(towTruck.vehicle.capacityTons) }}
        </li>
        <li>
          <AppIcon name="clock" :size="15" />
          {{ towTruck.workingHours }}
        </li>
        <li>
          <AppIcon name="map" :size="15" />
          Հիմնական գտնվելու վայրը՝ {{ towTruck.location.name }}
        </li>
        <li v-if="mainAreas">
          <AppIcon name="map-pin" :size="15" />
          Սպասարկում է՝ {{ mainAreas }}
        </li>
      </ul>

      <p v-if="towTruck.startingPrice" class="truck-card__price">
        {{ formatStartingPrice(towTruck.startingPrice) }}
      </p>

      <div class="truck-card__actions">
        <a
          :href="phoneHref"
          class="truck-card__call"
          :aria-label="`Զանգահարել ${displayName}-ին`"
          @click="onPhoneClick"
        >
          <AppIcon name="phone" :size="18" />
          Զանգահարել
        </a>
        <a
          v-if="whatsappUrl"
          :href="whatsappUrl"
          target="_blank"
          rel="noopener"
          class="truck-card__whatsapp"
          aria-label="Գրել WhatsApp-ով"
          @click="onWhatsAppClick"
        >
          <AppIcon name="whatsapp" :size="18" />
        </a>
        <AppButton
          :to="getTowTruckRoute(towTruck.slug)"
          variant="outline"
          size="sm"
          class="truck-card__view"
        >
          Դիտել մանրամասները
        </AppButton>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.truck-card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition);

  &:hover {
    box-shadow: var(--shadow-md);
  }

  &__media {
    position: relative;
  }

  &__image {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    flex: 1;
  }

  &__name {
    margin: 0;
    font-size: 1.08rem;

    a {
      color: var(--color-text);

      &:hover {
        color: var(--color-primary-light);
      }
    }
  }

  &__specs {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    li {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      font-size: 0.88rem;
      line-height: 1.5;
      color: var(--color-text-secondary);

      svg {
        flex-shrink: 0;
        margin-top: 3px;
        color: var(--color-text-muted);
      }
    }
  }

  &__price {
    margin: 0;
    font-weight: 700;
    color: var(--color-text);
  }

  /* 2 rows: [Զանգահարել | WhatsApp] / [Դիտել մանրամասները] — never overflows narrow cards */
  &__actions {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
    margin-top: auto;
  }

  &__view {
    grid-column: 1 / -1;
  }

  &__call {
    min-width: 0;
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

  &__whatsapp {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-success-bg);
    color: var(--color-success);
    transition: background var(--transition);

    &:hover {
      background: #d3f0e0;
    }
  }
}
</style>
