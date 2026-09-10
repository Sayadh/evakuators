<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { freeRoutesService } from '~/services'
import { buildFreeRoutesFaq } from '~/utils/faqContent'

const { t, locale } = useI18n()

useSeoMetaData({
  title: `${t('freeRoutes.metaTitle')} | ${SITE_NAME}`,
  description: t('freeRoutes.metaDescription'),
  path: '/free-routes',
})

const { forFreeRoutes } = useBreadcrumbs()
const faqItems = computed(() => buildFreeRoutesFaq(locale.value))

const { data: routes, pending } = useAsyncData('free-routes', () => freeRoutesService.getActive(), {
  default: () => [],
})

/**
 * The second number the admin panel tracks: how many people actually open
 * Ազատ երթուղիներ. onMounted for the same reason as the site-wide visit —
 * an SSR render or a crawl is not a person opening the page.
 */
const { trackFreeRoutesView } = useAnalyticsTracking()
onMounted(trackFreeRoutesView)
</script>

<template>
  <div class="container free-routes-page">
    <AppBreadcrumbs :items="forFreeRoutes()" />

    <h1>{{ t('freeRoutes.h1') }}</h1>
    <p class="free-routes-page__intro">
      {{ t('freeRoutes.intro') }}
    </p>

    <div v-if="pending" class="free-routes-page__grid">
      <LoadingSkeleton variant="card" :count="6" />
    </div>

    <div v-else-if="routes.length > 0" class="free-routes-page__grid">
      <FreeRouteCard v-for="route in routes" :key="route.id" :route="route" />
    </div>

    <p v-else class="free-routes-page__empty">
      {{ t('freeRoutes.empty') }}
    </p>

    <FaqSection :items="faqItems" class="free-routes-page__section" />
  </div>
</template>

<style scoped lang="scss">
.free-routes-page {
  padding-bottom: var(--space-8);

  &__intro {
    color: var(--color-text-secondary);
    max-width: 640px;
    margin-bottom: var(--space-5);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);

    @media (min-width: 640px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (min-width: 1024px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__empty {
    color: var(--color-text-secondary);
    padding: var(--space-6) 0;
  }

  &__section {
    margin-top: var(--space-6);
  }
}
</style>
