<script setup lang="ts">
import type { TowTruckCard } from '~/types/towTruck'
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { formatCapacity } from '~/utils/formatters'
import { formatStartingPrice } from '~/utils/formatPrice'
import { getTowTruckRoute } from '~/utils/routeHelpers'

interface Props {
  towTruck: TowTruckCard
}

const props = defineProps<Props>()

// WhatsApp is deliberately NOT offered here — only on the full profile
// (TowTruckContactActions.vue). The card is a lightweight teaser shown to
// every visitor at once; a driver's messaging channel is the kind of detail
// that belongs on their own page, not broadcast on every listing card.
const { phoneHref, onPhoneClick } = usePhoneActions(() => props.towTruck)

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
          v-if="towTruck.images[0]"
          :src="towTruck.images[0]"
          :alt="`${displayName} — ${towTruck.vehicle.brand} ${towTruck.vehicle.model} էվակուատոր`"
          class="truck-card__image"
          width="400"
          height="225"
          loading="lazy"
          format="webp"
        />
        <!-- Registration requires a photo and the dashboard can't remove the
             last one, so this should be unreachable — but an <img> with an
             undefined src renders as a broken-image icon, which is a much
             worse failure than a neutral placeholder if it ever happens. -->
        <span v-else class="truck-card__image truck-card__image--empty" aria-hidden="true">
          <AppIcon name="truck" :size="40" />
        </span>
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
          <strong class="truck-card__vehicle-type">{{
            VEHICLE_TYPE_LABELS[towTruck.vehicle.type]
          }}</strong>
        </li>
        <li>
          <AppIcon name="weight" :size="15" />
          Մինչև {{ formatCapacity(towTruck.vehicle.capacityTons) }}
        </li>
        <li v-if="towTruck.workingHours">
          <AppIcon name="clock" :size="15" />
          {{ towTruck.workingHours }}
        </li>
        <!-- Deliberately louder than its neighbours: on a city page the list is
             ordered so the drivers BASED here come first (see sortTowTrucks),
             and that ordering is invisible unless the base is easy to read. -->
        <li class="truck-card__base">
          <AppIcon name="map" :size="17" />
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

    &--empty {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg);
      color: var(--color-text-muted);
    }
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

  /** The vehicle type (e.g. "Հարթակով էվակուատոր") — bold so it reads as the
   * headline fact of the first spec line, not just another word in it. */
  &__vehicle-type {
    font-weight: 700;
    color: var(--color-text);
  }

  /**
   * The driver's own base — the fact the city listings are now ordered by, so
   * it reads a step louder than the rest of the meta list.
   *
   * 0.88rem + 2px = 0.88rem + 0.125rem at the 16px root this project uses. Kept
   * as a `calc` on the inherited size rather than a hard-coded 1.005rem so it
   * still tracks if the list's own size is ever changed, and so the "+2px" the
   * change was asked for stays legible in the source.
   *
   * Written as a descendant pair rather than a bare `&__base` because the rule
   * it has to beat is `&__specs li` — one class plus one element — which a
   * single class selector loses to. This is `.truck-card__specs
   * .truck-card__base`, two classes, so it wins on specificity rather than on
   * source order, and stays winning if the block is ever moved.
   *
   * (This selector previously read `&__meta &__base` — `&__meta` does not
   * exist anywhere in this component, so the rule never matched and the base
   * line rendered as plain text despite the intent above. Fixed to
   * `&__specs`, the list's real class.)
   */
  &__specs &__base {
    font-size: calc(0.88rem + 2px);
    font-weight: 700;
    color: var(--color-text);

    svg {
      color: var(--color-primary);
    }
  }

  &__price {
    margin: 0;
    font-weight: 700;
    color: var(--color-text);
  }

  /* 2 rows: [Զանգահարել] / [Դիտել մանրամասները] */
  &__actions {
    display: grid;
    grid-template-columns: 1fr;
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
}
</style>
