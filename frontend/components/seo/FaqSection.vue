<script setup lang="ts">
import type { FaqItem } from '~/types/common'
import { buildFaqSchema } from '~/utils/schemaOrg'

interface Props {
  items: FaqItem[]
  title?: string
}

const props = withDefaults(defineProps<Props>(), { title: 'Հաճախ տրվող հարցեր' })

useJsonLd([buildFaqSchema(props.items)])
</script>

<template>
  <section class="faq" aria-labelledby="faq-title">
    <h2 id="faq-title" class="faq__title">{{ title }}</h2>
    <details v-for="item in items" :key="item.question" class="faq__item">
      <summary class="faq__question">
        {{ item.question }}
        <AppIcon name="chevron-down" :size="18" class="faq__chevron" />
      </summary>
      <p class="faq__answer">{{ item.answer }}</p>
    </details>
  </section>
</template>

<style scoped lang="scss">
.faq {
  &__title {
    margin-bottom: var(--space-4);
  }

  &__item {
    background: var(--color-surface);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
    box-shadow: var(--shadow-sm);

    &[open] .faq__chevron {
      transform: rotate(180deg);
    }
  }

  &__question {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4);
    font-weight: 600;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }
  }

  &__chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform var(--transition);
  }

  &__answer {
    margin: 0;
    padding: 0 var(--space-4) var(--space-4);
    color: var(--color-text-secondary);
    font-size: 0.95rem;
  }
}
</style>
