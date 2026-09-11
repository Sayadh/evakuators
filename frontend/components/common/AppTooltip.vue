<script setup lang="ts">
/**
 * Info icon with a tooltip shown on hover / keyboard focus.
 * Content goes into the default slot.
 */
interface Props {
  /**
   * Accessible name for the trigger button. Defaults to a generic «Լրացուցիչ
   * տեղեկություն» in the visitor's own language.
   *
   * `undefined` rather than a literal default, because a `withDefaults` default
   * is evaluated OUTSIDE `setup()` — `useI18n()` is not available there, and a
   * default that called it would throw on import. Same fix as `AppSelect` and
   * `PlatformDimensionsInput`.
   */
  label?: string
}

const props = withDefaults(defineProps<Props>(), { label: undefined })

const { t } = useI18n()

const effectiveLabel = computed(() => props.label ?? t('a11y.moreInfo'))
</script>

<template>
  <span class="tooltip">
    <button type="button" class="tooltip__trigger" :aria-label="effectiveLabel">
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
