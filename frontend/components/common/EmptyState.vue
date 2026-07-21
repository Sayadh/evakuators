<script setup lang="ts">
import type { IconName } from '~/components/common/AppIcon.vue'

interface Props {
  title: string
  description?: string
  icon?: IconName
}

withDefaults(defineProps<Props>(), { description: undefined, icon: 'truck' })
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon">
      <AppIcon :name="icon" :size="36" />
    </div>
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div v-if="$slots.actions" class="empty-state__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-7) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--color-border);

  &__icon {
    display: inline-flex;
    padding: var(--space-4);
    border-radius: 50%;
    background: var(--color-bg);
    color: var(--color-text-muted);
    margin-bottom: var(--space-4);
  }

  &__title {
    margin-bottom: var(--space-2);
  }

  &__description {
    color: var(--color-text-secondary);
    max-width: 420px;
    margin-bottom: var(--space-4);
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: center;
  }
}
</style>
