<script setup lang="ts">
interface Props {
  variant?: 'success' | 'accent' | 'primary' | 'neutral'
}

withDefaults(defineProps<Props>(), { variant: 'neutral' })
</script>

<template>
  <span class="app-badge" :class="`app-badge--${variant}`">
    <slot />
  </span>
</template>

<style scoped lang="scss">
.app-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;

  &--success {
    background: var(--color-success-bg);
    color: var(--color-success);
  }

  &--accent {
    background: rgba(246, 168, 33, 0.15);
    color: #a36c00;
  }

  &--primary {
    background: rgba(20, 48, 79, 0.09);
    color: var(--color-primary);
  }

  &--neutral {
    background: var(--color-bg);
    color: var(--color-text-secondary);
  }
}
</style>
