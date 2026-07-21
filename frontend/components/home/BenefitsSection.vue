<script setup lang="ts">
import type { IconName } from '~/components/common/AppIcon.vue'

interface Benefit {
  icon: IconName
  title: string
  description: string
}

const BENEFITS: Benefit[] = [
  {
    icon: 'map',
    title: 'Ամբողջ Հայաստանում',
    description: 'Ծառայություններ բոլոր մարզերում և Երևանի բոլոր վարչական շրջաններում։',
  },
  {
    icon: 'phone',
    title: 'Ուղիղ կապ վարորդի հետ',
    description: 'Զանգահարեք անմիջապես վարորդին՝ առանց միջնորդների և հավելյալ վճարների։',
  },
  {
    icon: 'image',
    title: 'Իրական նկարներ',
    description: 'Տեսեք էվակուատորի իրական նկարները նախքան զանգելը։',
  },
  {
    icon: 'clock',
    title: '24/7 ծառայություններ',
    description: 'Գիշեր թե ցերեկ՝ միշտ կգտնեք շուրջօրյա աշխատող էվակուատոր։',
  },
  {
    icon: 'search',
    title: 'Պարզ որոնում',
    description: 'Որոնեք ըստ մարզի, քաղաքի, ծառայության տեսակի և բեռնատարողության։',
  },
  {
    icon: 'check',
    title: 'Անվճար օգտագործում',
    description: 'Էվակուատոր փնտրելը և վարորդին զանգելը ամբողջությամբ անվճար է։',
  },
]
</script>

<template>
  <section class="benefits section" aria-labelledby="benefits-title">
    <div class="container">
      <h2 id="benefits-title" class="section-title">Ինչու՞ Evakuators.am</h2>
      <div class="benefits__grid">
        <article v-for="benefit in BENEFITS" :key="benefit.title" class="benefits__item">
          <AppIcon :name="benefit.icon" :size="24" class="benefits__icon" />
          <h3 class="benefits__item-title">{{ benefit.title }}</h3>
          <p class="benefits__item-text">{{ benefit.description }}</p>
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
