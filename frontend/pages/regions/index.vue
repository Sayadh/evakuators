<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { buildAllRegionsFaq } from '~/utils/faqContent'
import { getYerevanRoute } from '~/utils/routeHelpers'

const { data: regions, pending } = useRegions()
const { forRegions } = useBreadcrumbs()
const { t } = useI18n()

useSeoMetaData({
  // The brand stays literal at the end of every title — it is a name, not a
  // word to translate. See `utils/seoContent.ts`.
  title: `${t('regionsPage.metaTitle')} | ${SITE_NAME}`,
  description: t('regionsPage.metaDescription'),
  path: '/regions',
})

const faqItems = buildAllRegionsFaq()
</script>

<template>
  <div class="container">
    <AppBreadcrumbs :items="forRegions()" />

    <h1>{{ t('regionsPage.title') }}</h1>

    <NearestTowTrucksCta class="regions-page__nearest" />

    <!-- Beside the «մոտակա» shortcut, both answering the same question a
         stranded visitor arrives with — "I don't know which one to pick".
         Above the listing but below the page heading on purpose: it must not
         be the first thing read on a page whose job is to show drivers. -->
    <DispatchCallCta variant="banner" class="regions-page__dispatch" />

    <NuxtLinkLocale :to="getYerevanRoute()" class="regions-page__yerevan">
      <div>
        <h2>{{ t('regionsPage.yerevanTitle') }}</h2>
        <p>{{ t('regionsPage.yerevanText') }}</p>
      </div>
      <AppIcon name="arrow-right" :size="24" />
    </NuxtLinkLocale>

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
  &__nearest {
    margin-bottom: var(--space-5);
  }

  &__dispatch {
    margin-top: var(--space-5);
    margin-bottom: var(--space-5);
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
