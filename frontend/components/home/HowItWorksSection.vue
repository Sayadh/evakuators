<script setup lang="ts">
import type { IconName } from '~/components/common/AppIcon.vue'

/** Static copy lives in i18n/locales — see nuxt.config's i18n block */
const { t } = useI18n()

interface Step {
  icon: IconName
  titleKey: string
  textKey: string
}

const STEPS: Step[] = [
  {
    icon: 'map-pin',
    titleKey: 'home.step1Title',
    textKey: 'home.step1Text',
  },
  {
    icon: 'truck',
    titleKey: 'home.step2Title',
    textKey: 'home.step2Text',
  },
  {
    icon: 'phone',
    titleKey: 'home.step3Title',
    textKey: 'home.step3Text',
  },
]
</script>

<template>
  <section id="how-it-works" class="how section" aria-labelledby="how-title">
    <div class="container">
      <h2 id="how-title" class="section-title">{{ t('home.howItWorks') }}</h2>
      <ol class="how__steps">
        <li v-for="(step, index) in STEPS" :key="step.titleKey" class="how__step">
          <div class="how__icon">
            <AppIcon :name="step.icon" :size="26" />
            <span class="how__number" aria-hidden="true">{{ index + 1 }}</span>
          </div>
          <h3 class="how__step-title">{{ t(step.titleKey) }}</h3>
          <p class="how__step-text">{{ t(step.textKey) }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped lang="scss">
.how {
  &__steps {
    list-style: none;
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-5);

    @media (min-width: 768px) {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  &__step {
    text-align: center;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  &__icon {
    position: relative;
    display: inline-flex;
    padding: var(--space-4);
    border-radius: 50%;
    background: rgba(20, 48, 79, 0.07);
    color: var(--color-primary);
    margin-bottom: var(--space-3);
  }

  &__number {
    position: absolute;
    top: -4px;
    right: -4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-primary-dark);
    font-size: 0.8rem;
    font-weight: 800;
  }

  &__step-title {
    margin-bottom: var(--space-2);
  }

  &__step-text {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.95rem;
  }
}
</style>
