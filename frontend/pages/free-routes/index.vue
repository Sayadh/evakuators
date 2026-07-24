<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { freeRoutesService } from '~/services'
import { buildFreeRoutesFaq } from '~/utils/faqContent'

useSeoMetaData({
  title: `Ազատ երթուղիներ | Դատարկ ուղղությամբ շարժվող էվակուատորներ | ${SITE_NAME}`,
  description:
    'Գտեք էվակուատոր, որն արդեն շարժվում է ձեր ուղղությամբ դատարկ։ Կապվեք վարորդի հետ անմիջապես։',
  path: '/free-routes',
})

const { forFreeRoutes } = useBreadcrumbs()
const faqItems = buildFreeRoutesFaq()

const { data: routes, pending } = useAsyncData('free-routes', () => freeRoutesService.getActive(), {
  default: () => [],
})
</script>

<template>
  <div class="container free-routes-page">
    <AppBreadcrumbs :items="forFreeRoutes()" />

    <h1>Ազատ երթուղիներ</h1>
    <p class="free-routes-page__intro">
      Այս վարորդները մեկնում են դատարկ նշված ուղղությամբ և կարող են ճանապարհին կամ վերջնակետում
      վերցնել նոր պատվեր։ Կապվեք ուղղակիորեն վարորդի հետ։
    </p>

    <div v-if="pending" class="free-routes-page__grid">
      <LoadingSkeleton variant="card" :count="6" />
    </div>

    <div v-else-if="routes.length > 0" class="free-routes-page__grid">
      <FreeRouteCard v-for="route in routes" :key="route.id" :route="route" />
    </div>

    <p v-else class="free-routes-page__empty">
      Այս պահին ակտիվ ազատ երթուղիներ չկան։ Ստուգեք մի փոքր ուշ։
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
