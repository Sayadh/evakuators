<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { buildAllRegionsFaq } from '~/utils/faqContent'
import { getYerevanRoute } from '~/utils/routeHelpers'

const { data: regions, pending } = useRegions()
const { forRegions } = useBreadcrumbs()

useSeoMetaData({
  title: `Հայաստանի մարզեր | Էվակուատորներ բոլոր մարզերում | ${SITE_NAME}`,
  description:
    'Ընտրեք ձեր մարզը և գտեք մոտակա էվակուատորը։ Ծառայություններ Հայաստանի բոլոր 10 մարզերում և Երևանում։',
  path: '/regions',
})

const faqItems = buildAllRegionsFaq()
</script>

<template>
  <div class="container">
    <AppBreadcrumbs :items="forRegions()" />

    <h1>Հայաստանի մարզեր</h1>
    <p class="regions-page__intro">
      Ընտրեք մարզը՝ քաղաքների ցանկը և հասանելի էվակուատորները տեսնելու համար։
    </p>

    <NuxtLink :to="getYerevanRoute()" class="regions-page__yerevan">
      <div>
        <h2>Երևան</h2>
        <p>Դիտեք Երևանի բոլոր 12 վարչական շրջանների էվակուատորները</p>
      </div>
      <AppIcon name="arrow-right" :size="24" />
    </NuxtLink>

    <div v-if="pending" class="card-grid regions-page__grid">
      <LoadingSkeleton variant="card" :count="10" />
    </div>
    <div v-else class="card-grid regions-page__grid">
      <RegionCard v-for="region in regions" :key="region.id" :region="region" />
    </div>

    <FaqSection :items="faqItems" class="regions-page__section" />
  </div>
</template>

<style scoped lang="scss">
.regions-page {
  &__intro {
    color: var(--color-text-secondary);
    max-width: 600px;
  }

  &__yerevan {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    background: var(--color-primary);
    color: #fff;
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    margin: var(--space-5) 0 var(--space-4);
    transition: box-shadow var(--transition);

    &:hover {
      color: #fff;
      box-shadow: var(--shadow-lg);
    }

    h2 {
      color: #fff;
      margin-bottom: var(--space-1);
    }

    p {
      margin: 0;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.92rem;
    }
  }

  &__grid {
    margin-bottom: var(--space-6);
  }

  &__section {
    margin-top: var(--space-6);
    margin-bottom: var(--space-6);
  }
}
</style>
