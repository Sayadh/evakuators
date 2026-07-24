<script setup lang="ts">
import { getYerevanRoute } from '~/utils/routeHelpers'

const { data: regions, pending } = useRegions()
const { data: districts } = useDistricts()
// Distinct trucks serving Yerevan (servesYerevan) — NOT a sum of each
// district's own towTruckCount, which double(/12x)-counts a single truck
// that lists many districts as its service area.
const { data: yerevanTrucks } = useTowTrucksInYerevan()

const yerevanTruckCount = computed(() => yerevanTrucks.value.length)
// "+" only makes sense once the real count is large enough that it reads as
// an approximation — below that it's just the exact number.
const yerevanTruckCountLabel = computed(() =>
  yerevanTruckCount.value > 20 ? `${yerevanTruckCount.value}+` : `${yerevanTruckCount.value}`,
)
</script>

<template>
  <section class="regions section" aria-labelledby="regions-title">
    <div class="container">
      <h2 id="regions-title" class="section-title">Ընտրեք ձեր տարածքը</h2>

      <NuxtLink :to="getYerevanRoute()" class="regions__yerevan">
        <span class="regions__yerevan-tag">Ամենամեծ ընտրանքը</span>
        <div class="regions__yerevan-body">
          <div class="regions__yerevan-text">
            <h3>Երևան</h3>
            <p>{{ districts.length }} վարչական շրջան · էվակուատորներ ամբողջ քաղաքում</p>
          </div>
          <div class="regions__yerevan-stat">
            <span class="regions__yerevan-stat-number">{{ yerevanTruckCountLabel }}</span>
            <span class="regions__yerevan-stat-label">
              <AppIcon name="truck" :size="14" /> էվակուատոր
            </span>
          </div>
          <AppIcon name="arrow-right" :size="24" class="regions__yerevan-arrow" />
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
    display: block;
    position: relative;
    background: linear-gradient(135deg, var(--color-primary-light) 0%, var(--color-primary-dark) 100%);
    color: #fff;
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    margin-bottom: var(--space-4);
    overflow: hidden;
    box-shadow: var(--shadow-md);
    transition:
      box-shadow var(--transition),
      transform var(--transition);

    &:hover {
      color: #fff;
      box-shadow: 0 12px 28px rgba(20, 48, 79, 0.28);
      transform: translateY(-3px);
    }

    h3 {
      color: #fff;
      margin-bottom: var(--space-1);
      font-size: 1.5rem;
    }

    p {
      margin: 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.92rem;
    }
  }

  &__yerevan-tag {
    display: inline-block;
    background: var(--color-accent);
    color: var(--color-primary-dark);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding: 3px var(--space-2);
    border-radius: var(--radius-sm, 6px);
    margin-bottom: var(--space-3);
  }

  &__yerevan-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  &__yerevan-text {
    flex: 1 1 auto;
    min-width: 180px;
  }

  &__yerevan-stat {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  &__yerevan-stat-number {
    font-size: 2.1rem;
    font-weight: 800;
    line-height: 1;
    color: var(--color-accent);
  }

  &__yerevan-stat-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.75);
    margin-top: 2px;
  }

  &__yerevan-arrow {
    flex-shrink: 0;
    display: none;
  }

  @media (min-width: 640px) {
    &__yerevan {
      padding: var(--space-6);
    }

    &__yerevan-arrow {
      display: block;
    }
  }
}
</style>
