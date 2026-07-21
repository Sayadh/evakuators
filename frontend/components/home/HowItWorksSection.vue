<script setup lang="ts">
import type { IconName } from '~/components/common/AppIcon.vue'

interface Step {
  icon: IconName
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    icon: 'map-pin',
    title: 'Ընտրեք մարզը կամ քաղաքը',
    description: 'Գտեք ձեր տարածքը որոնման դաշտով կամ քարտեզային ցանկից։',
  },
  {
    icon: 'truck',
    title: 'Համեմատեք էվակուատորներին',
    description: 'Դիտեք մեքենաների նկարները, գները և ծառայությունները։',
  },
  {
    icon: 'phone',
    title: 'Զանգահարեք անմիջապես',
    description: 'Կապվեք վարորդի հետ ուղիղ հեռախոսով կամ WhatsApp-ով՝ առանց միջնորդի։',
  },
]
</script>

<template>
  <section id="how-it-works" class="how section" aria-labelledby="how-title">
    <div class="container">
      <h2 id="how-title" class="section-title">Ինչպես է աշխատում</h2>
      <ol class="how__steps">
        <li v-for="(step, index) in STEPS" :key="step.title" class="how__step">
          <div class="how__icon">
            <AppIcon :name="step.icon" :size="26" />
            <span class="how__number" aria-hidden="true">{{ index + 1 }}</span>
          </div>
          <h3 class="how__step-title">{{ step.title }}</h3>
          <p class="how__step-text">{{ step.description }}</p>
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
