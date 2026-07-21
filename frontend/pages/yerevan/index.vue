<script setup lang="ts">
import { buildLocationSeo, buildTranslitParagraph } from '~/utils/seoContent'

const { data: districts, pending } = useDistricts()
const { data: towTrucks, pending: towTrucksPending } = useTowTrucksInYerevan()
const { forYerevan } = useBreadcrumbs()

const seoParagraphs = [
  'Էվակուատոր Երևանում. ընտրեք վարչական շրջանը կամ դիտեք քաղաքի բոլոր էվակուատորները մեկ ցանկով։ Իրական նկարներ, գներ, 24/7 ծառայություններ և ուղիղ կապ վարորդի հետ։',
  buildTranslitParagraph('Երևան', 'erevan'),
]

useSeoMetaData({
  ...buildLocationSeo('Երևան', 'erevan'),
  path: '/yerevan',
})
</script>

<template>
  <div class="container yerevan-page">
    <AppBreadcrumbs :items="forYerevan()" />

    <header class="yerevan-page__header">
      <h1>Էվակուատորներ Երևանում</h1>
      <p class="yerevan-page__description">
        Ընտրեք վարչական շրջանը՝ տվյալ տարածքում աշխատող էվակուատորները տեսնելու համար։ Վարորդների
        մեծ մասը սպասարկում է ամբողջ քաղաքը։
      </p>
      <div class="yerevan-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="map-pin" :size="14" /> 12 վարչական շրջան
        </AppBadge>
        <AppBadge variant="accent">
          <AppIcon name="truck" :size="14" /> {{ towTrucks.length }} էվակուատոր
        </AppBadge>
      </div>
    </header>

    <div v-if="pending" class="card-grid">
      <LoadingSkeleton variant="card" :count="12" />
    </div>
    <div v-else class="card-grid">
      <DistrictCard v-for="district in districts" :key="district.id" :district="district" />
    </div>

    <section aria-labelledby="yerevan-trucks-title" class="yerevan-page__section">
      <h2 id="yerevan-trucks-title">Բոլոր էվակուատորները Երևանում ({{ towTrucks.length }})</h2>
      <TowTruckList :tow-trucks="towTrucks" :pending="towTrucksPending" :skeleton-count="6" />
    </section>

    <SeoTextSection
      title="Էվակուատորի ծառայություններ Երևանում"
      :paragraphs="seoParagraphs"
      class="yerevan-page__section"
    />
  </div>
</template>

<style scoped lang="scss">
.yerevan-page {
  padding-bottom: var(--space-6);

  &__header {
    margin-bottom: var(--space-5);
  }

  &__description {
    color: var(--color-text-secondary);
    max-width: 680px;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__section {
    margin-top: var(--space-6);
  }
}
</style>
