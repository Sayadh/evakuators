<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { getRegisterRoute, getRegionsRoute } from '~/utils/routeHelpers'

const { t } = useI18n()

useSeoMetaData({
  title: `${t('about.title')} | ${SITE_NAME}`,
  description: t('about.metaDescription'),
  path: '/about',
})
</script>

<template>
  <div class="container static-page">
    <h1>{{ t('about.title') }}</h1>
    <div class="static-page__content">
      <p>{{ t('about.p1') }}</p>
      <p>{{ t('about.p2') }}</p>
      <p>{{ t('about.p3') }}</p>
      <div class="static-page__actions">
        <AppButton :to="getRegionsRoute()" variant="primary">{{ t('about.findButton') }}</AppButton>
        <AppButton :to="getRegisterRoute()" variant="accent">{{ t('common.registerTruck') }}</AppButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.static-page {
  padding-bottom: var(--space-7);
  max-width: 760px;

  &__content {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-sm);
    color: var(--color-text-secondary);
    line-height: 1.7;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }
}
</style>
