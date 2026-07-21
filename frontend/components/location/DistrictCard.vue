<script setup lang="ts">
import type { DistrictWithStats } from '~/types/location'
import { getDistrictRoute } from '~/utils/routeHelpers'

interface Props {
  district: DistrictWithStats
}

defineProps<Props>()
</script>

<template>
  <article class="district-card">
    <h3 class="district-card__name">
      <NuxtLink :to="getDistrictRoute(district.slug)" class="district-card__link">
        {{ district.name }}
      </NuxtLink>
    </h3>
    <ul class="district-card__stats">
      <li><AppIcon name="truck" :size="16" /> {{ district.towTruckCount }} էվակուատոր</li>
      <li><AppIcon name="clock" :size="16" /> {{ district.towTruck24hCount }} աշխատում է 24/7</li>
    </ul>
    <span class="district-card__cta">
      Դիտել էվակուատորները
      <AppIcon name="arrow-right" :size="16" />
    </span>
  </article>
</template>

<style scoped lang="scss">
.district-card {
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
