<script setup lang="ts">
import type { NuxtError } from '#app'
import { getRegionsRoute } from '~/utils/routeHelpers'

interface Props {
  error: NuxtError
}

const props = defineProps<Props>()

const is404 = computed(() => props.error.statusCode === 404)

const title = computed(() =>
  is404.value ? 'Էջը չի գտնվել' : 'Ինչ-որ բան այն չէ',
)

const description = computed(() =>
  is404.value
    ? 'Փնտրած էջը գոյություն չունի կամ տեղափոխվել է։ Ստուգեք հասցեն կամ վերադարձեք գլխավոր էջ։'
    : 'Տվյալները չհաջողվեց բեռնել։ Փորձեք թարմացնել էջը կամ վերադարձեք գլխավոր էջ։',
)

useHead({ title: `${title.value} | Evakuators.am` })

function goHome(): void {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="error-page">
    <AppHeader />
    <main class="error-page__main">
      <div class="container error-page__content">
        <p class="error-page__code">{{ error.statusCode }}</p>
        <h1>{{ title }}</h1>
        <p class="error-page__description">{{ description }}</p>
        <div class="error-page__actions">
          <AppButton variant="primary" @click="goHome">Գլխավոր էջ</AppButton>
          <AppButton :to="getRegionsRoute()" variant="outline" @click="clearError()">
            Դիտել մարզերը
          </AppButton>
        </div>
      </div>
    </main>
    <AppFooter />
  </div>
</template>

<style scoped lang="scss">
.error-page {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;

  &__main {
    flex: 1;
    display: flex;
    align-items: center;
  }

  &__content {
    text-align: center;
    padding: var(--space-8) var(--space-4);
  }

  &__code {
    font-size: 4.5rem;
    font-weight: 800;
    color: var(--color-primary);
    opacity: 0.25;
    margin: 0;
    line-height: 1;
  }

  &__description {
    color: var(--color-text-secondary);
    max-width: 460px;
    margin: 0 auto var(--space-5);
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
  }
}
</style>
