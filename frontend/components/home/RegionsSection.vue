<script setup lang="ts">
import { getYerevanRoute } from '~/utils/routeHelpers'

const { data: regions, pending } = useRegions()
const { data: districts } = useDistricts()

const yerevanTruckCount = computed(() =>
  districts.value.reduce((sum, district) => sum + district.towTruckCount, 0),
)
</script>

<template>
  <section class="regions section" aria-labelledby="regions-title">
    <div class="container">
      <h2 id="regions-title" class="section-title">Ընտրեք ձեր տարածքը</h2>

      <NuxtLink :to="getYerevanRoute()" class="regions__yerevan">
        <div class="regions__yerevan-text">
          <h3>Երևան</h3>
          <p>{{ districts.length }} վարչական շրջան · էվակուատորներ ամբողջ քաղաքում</p>
        </div>
        <div class="regions__yerevan-meta">
          <AppBadge variant="accent">
            <AppIcon name="truck" :size="14" /> {{ yerevanTruckCount }}+ ծառայություն
          </AppBadge>
          <AppIcon name="arrow-right" :size="22" />
        </div>
      </NuxtLink>

      <div v-if="pending" class="card-grid">
        <LoadingSkeleton variant="card" :count="6" />
      </div>
      <div v-else class="card-grid">
        <RegionCard v-for="region in regions" :key="region.id" :region="region" />
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.regions {
  &__yerevan {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    background: var(--color-primary);
    color: #fff;
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    margin-bottom: var(--space-4);
    transition:
      box-shadow var(--transition),
      transform var(--transition);

    &:hover {
      color: #fff;
      box-shadow: var(--shadow-lg);
      transform: translateY(-2px);
    }

    h3 {
      color: #fff;
      margin-bottom: var(--space-1);
      font-size: 1.3rem;
    }

    p {
      margin: 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.92rem;
    }
  }

  &__yerevan-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }
}
</style>
