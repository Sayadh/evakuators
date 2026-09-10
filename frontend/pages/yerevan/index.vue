<script setup lang="ts">
import { buildLocationSeo, buildTranslitParagraph } from '~/utils/seoContent'

const { data: districts, pending } = useDistricts()
const { data: towTrucks, pending: towTrucksPending } = useTowTrucksInYerevan()
const { forYerevan } = useBreadcrumbs()

const { t, locale } = useI18n()
const plural = usePlural()

const seoParagraphs = computed(() => [
  t('yerevanPage.intro'),
  buildTranslitParagraph('Երևան', 'erevan', locale.value),
])

useSeoMetaData({
  ...buildLocationSeo('Երևան', 'erevan', locale.value),
  path: '/yerevan',
})
</script>

<template>
  <div class="container yerevan-page">
    <AppBreadcrumbs :items="forYerevan()" />

    <header class="yerevan-page__header">
      <h1>{{ t('yerevanPage.h1') }}</h1>
      <div class="yerevan-page__stats">
        <AppBadge variant="primary">
          <AppIcon name="map-pin" :size="14" /> {{ t('yerevanPage.districtsBadge', { count: 12 }) }}
        </AppBadge>
        <AppBadge variant="accent">
          <AppIcon name="truck" :size="14" /> {{ plural('card.towTrucks', towTrucks.length) }}
        </AppBadge>
      </div>
    </header>

    <NearestTowTrucksCta class="yerevan-page__nearest" />

    <!-- Beside the «մոտակա» shortcut, both answering the same question a
         stranded visitor arrives with — "I don't know which one to pick".
         Above the listing but below the page heading on purpose: it must not
         be the first thing read on a page whose job is to show drivers. -->
    <DispatchCallCta variant="banner" class="yerevan-page__dispatch" />

    <div v-if="pending" class="card-grid">
      <LoadingSkeleton variant="card" :count="12" />
    </div>
    <div v-else class="card-grid">
      <DistrictCard v-for="district in districts" :key="district.id" :district="district" />
    </div>

    <section aria-labelledby="yerevan-trucks-title" class="yerevan-page__section">
      <h2 id="yerevan-trucks-title">
        {{ t('yerevanPage.allTrucks', { count: towTrucks.length }) }}
      </h2>
      <TowTruckList :tow-trucks="towTrucks" :pending="towTrucksPending" :skeleton-count="6" />
    </section>

    <SeoTextSection
      :title="t('yerevanPage.seoTitle')"
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

  &__nearest {
    margin-bottom: var(--space-5);
  }

  &__dispatch {
    margin-top: var(--space-5);
    margin-bottom: var(--space-5);
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
