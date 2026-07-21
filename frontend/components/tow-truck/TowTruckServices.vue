<script setup lang="ts">
import type { ServiceType } from '~/types/enums'
import { SERVICE_LABELS } from '~/constants/services'

interface Props {
  services: ServiceType[]
}

defineProps<Props>()
</script>

<template>
  <section class="truck-services" aria-labelledby="truck-services-title">
    <h2 id="truck-services-title" class="truck-services__title">Ծառայություններ</h2>
    <ul class="truck-services__list">
      <li v-for="service in services" :key="service" class="truck-services__item">
        <AppIcon name="check" :size="16" class="truck-services__check" />
        {{ SERVICE_LABELS[service] }}
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.truck-services {
  &__title {
    margin-bottom: var(--space-4);
  }

  &__list {
    list-style: none;
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-2);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.95rem;
  }

  &__check {
    flex-shrink: 0;
    color: var(--color-success);
  }
}
</style>
