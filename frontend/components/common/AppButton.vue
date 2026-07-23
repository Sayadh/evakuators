<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'accent' | 'success' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit'
  to?: string
  href?: string
  block?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  to: undefined,
  href: undefined,
  block: false,
  disabled: false,
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const tag = computed(() => {
  if (props.to) return resolveComponent('NuxtLink')
  if (props.href) return 'a'
  return 'button'
})

function onClick(event: MouseEvent): void {
  if (props.disabled) {
    event.preventDefault()
    return
  }
  emit('click', event)
}
</script>

<template>
  <component
    :is="tag"
    class="app-button"
    :class="[`app-button--${variant}`, `app-button--${size}`, { 'app-button--block': block }]"
    :to="to"
    :href="href"
    :type="!to && !href ? type : undefined"
    :disabled="!to && !href ? disabled : undefined"
    @click="onClick"
  >
    <slot />
  </component>
</template>

<style scoped lang="scss">
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background var(--transition),
    color var(--transition),
    border-color var(--transition),
    box-shadow var(--transition);

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &--sm {
    padding: var(--space-2) var(--space-3);
    font-size: 0.9rem;
  }

  &--md {
    padding: var(--space-3) var(--space-4);
  }

  &--lg {
    padding: var(--space-4) var(--space-5);
    font-size: 1.05rem;
  }

  &--block {
    width: 100%;
  }

  &--primary {
    background: var(--color-primary);
    color: #fff;

    &:hover:not(:disabled) {
      background: var(--color-primary-light);
      color: #fff;
    }
  }

  &--accent {
    background: var(--color-accent);
    color: var(--color-primary-dark);

    &:hover:not(:disabled) {
      background: var(--color-accent-dark);
      color: var(--color-primary-dark);
    }
  }

  &--success {
    background: var(--color-success);
    color: #fff;

    &:hover:not(:disabled) {
      background: #178a49;
      color: #fff;
    }
  }

  &--outline {
    background: transparent;
    color: var(--color-primary);
    border-color: var(--color-primary);

    &:hover:not(:disabled) {
      background: var(--color-primary);
      color: #fff;
    }
  }

  &--ghost {
    background: transparent;
    color: var(--color-primary);

    &:hover:not(:disabled) {
      background: rgba(20, 48, 79, 0.07);
    }
  }

  &--danger {
    background: transparent;
    color: var(--color-danger);
    border-color: var(--color-danger);

    &:hover:not(:disabled) {
      background: var(--color-danger);
      color: #fff;
    }
  }
}
</style>
