<script setup lang="ts">
/**
 * Info icon with a tooltip shown on hover / keyboard focus.
 * Content goes into the default slot.
 */
interface Props {
  label?: string
}

withDefaults(defineProps<Props>(), { label: 'Լրացուցիչ տեղեկություն' })
</script>

<template>
  <span class="tooltip">
    <button type="button" class="tooltip__trigger" :aria-label="label">
      <AppIcon name="info" :size="16" />
    </button>
    <span class="tooltip__bubble" role="tooltip">
      <slot />
    </span>
  </span>
</template>

<style scoped lang="scss">
.tooltip {
  position: relative;
  display: inline-flex;

  &__trigger {
    display: inline-flex;
    padding: 2px;
    border: none;
    background: none;
    color: var(--color-text-muted);
    cursor: help;
    border-radius: 50%;
    transition: color var(--transition);

    &:hover {
      color: var(--color-primary);
    }
  }

  &__bubble {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    width: 280px;
    max-width: 80vw;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-primary-dark);
    color: #fff;
    font-size: 0.82rem;
    font-weight: 400;
    line-height: 1.5;
    box-shadow: var(--shadow-lg);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--transition),
      visibility var(--transition);

    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: var(--color-primary-dark);
    }
  }

  &:hover .tooltip__bubble,
  &:focus-within .tooltip__bubble {
    opacity: 1;
    visibility: visible;
  }
}
</style>
