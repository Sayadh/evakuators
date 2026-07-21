<script setup lang="ts">
interface Props {
  title?: string
  paragraphs: string[]
}

withDefaults(defineProps<Props>(), { title: undefined })
</script>

<template>
  <section class="seo-text">
    <h2 v-if="title" class="seo-text__title">{{ title }}</h2>
    <p v-for="(paragraph, index) in paragraphs" :key="index" class="seo-text__paragraph">
      {{ paragraph }}
    </p>
  </section>
</template>

<style scoped lang="scss">
.seo-text {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-5);

  &__title {
    font-size: 1.2rem;
    margin-bottom: var(--space-3);
  }

  &__paragraph {
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    line-height: 1.7;

    &:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
