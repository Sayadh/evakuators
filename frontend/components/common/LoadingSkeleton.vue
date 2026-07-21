<script setup lang="ts">
interface Props {
  variant?: 'card' | 'profile' | 'text' | 'gallery'
  count?: number
}

withDefaults(defineProps<Props>(), { variant: 'card', count: 1 })
</script>

<template>
  <template v-if="variant === 'card'">
    <div v-for="n in count" :key="n" class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton--image" />
      <div class="skeleton-card__body">
        <div class="skeleton skeleton--line" style="width: 60%" />
        <div class="skeleton skeleton--line" style="width: 40%" />
        <div class="skeleton skeleton--line" style="width: 80%" />
        <div class="skeleton skeleton--button" />
      </div>
    </div>
  </template>

  <div v-else-if="variant === 'profile'" class="skeleton-profile" aria-hidden="true">
    <div class="skeleton skeleton--gallery" />
    <div class="skeleton skeleton--line" style="width: 45%; height: 28px" />
    <div class="skeleton skeleton--line" style="width: 30%" />
    <div class="skeleton skeleton--line" style="width: 70%" />
    <div class="skeleton skeleton--button" style="width: 200px" />
  </div>

  <div v-else-if="variant === 'gallery'" class="skeleton skeleton--gallery" aria-hidden="true" />

  <template v-else>
    <div v-for="n in count" :key="n" class="skeleton skeleton--line" aria-hidden="true" />
  </template>
</template>

<style scoped lang="scss">
@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton {
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, #e8ecf2 25%, #f4f6f9 50%, #e8ecf2 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s infinite linear;

  &--image {
    height: 180px;
    border-radius: 0;
  }

  &--gallery {
    height: 280px;
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-4);
  }

  &--line {
    height: 14px;
    margin-bottom: var(--space-2);
  }

  &--button {
    height: 44px;
    border-radius: var(--radius-md);
    margin-top: var(--space-3);
  }
}

.skeleton-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);

  &__body {
    padding: var(--space-4);
  }
}

.skeleton-profile {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}
</style>
