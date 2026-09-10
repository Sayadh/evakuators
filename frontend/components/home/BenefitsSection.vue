<script setup lang="ts">
import type { IconName } from '~/components/common/AppIcon.vue'

/** Static copy lives in i18n/locales — see nuxt.config's i18n block */
const { t } = useI18n()

interface Benefit {
  icon: IconName
  titleKey: string
  textKey: string
}

const BENEFITS: Benefit[] = [
  {
    icon: 'map',
    titleKey: 'home.benefitCountryTitle',
    textKey: 'home.benefitCountryText',
  },
  {
    icon: 'phone',
    titleKey: 'home.benefitDirectTitle',
    textKey: 'home.benefitDirectText',
  },
  {
    icon: 'image',
    titleKey: 'home.benefitPhotosTitle',
    textKey: 'home.benefitPhotosText',
  },
  {
    icon: 'clock',
    titleKey: 'home.benefitHoursTitle',
    textKey: 'home.benefitHoursText',
  },
  {
    icon: 'search',
    titleKey: 'home.benefitSearchTitle',
    textKey: 'home.benefitSearchText',
  },
  {
    icon: 'check',
    titleKey: 'home.benefitFreeTitle',
    textKey: 'home.benefitFreeText',
  },
]
</script>

<template>
  <section class="benefits section" aria-labelledby="benefits-title">
    <div class="container">
      <h2 id="benefits-title" class="section-title">{{ t('home.whyTitle') }}</h2>
      <div class="benefits__grid">
        <article v-for="benefit in BENEFITS" :key="benefit.titleKey" class="benefits__item">
          <AppIcon :name="benefit.icon" :size="24" class="benefits__icon" />
          <h3 class="benefits__item-title">{{ t(benefit.titleKey) }}</h3>
          <p class="benefits__item-text">{{ t(benefit.textKey) }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.benefits {
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

  &__item {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  &__icon {
    color: var(--color-accent-dark);
    margin-bottom: var(--space-3);
  }

  &__item-title {
    margin-bottom: var(--space-2);
    font-size: 1.05rem;
  }

  &__item-text {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.92rem;
  }
}
</style>
