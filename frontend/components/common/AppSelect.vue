<script setup lang="ts">
import type { SelectOption } from '~/types/common'

interface Props {
  modelValue: string
  options: SelectOption[]
  label?: string
  placeholder?: string
  disabled?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  placeholder: 'Ընտրել',
  disabled: false,
  error: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const id = useId()

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="app-select">
    <label v-if="label" :for="id" class="app-select__label">
      {{ label }}
      <slot name="label-suffix" />
    </label>
    <div class="app-select__wrap">
      <select
        :id="id"
        class="app-select__field"
        :class="{ 'app-select__field--placeholder': !modelValue }"
        :value="modelValue"
        :disabled="disabled"
        @change="onChange"
      >
        <option value="" disabled>{{ placeholder }}</option>
        <option v-for="option in props.options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <AppIcon name="chevron-down" :size="18" class="app-select__chevron" />
    </div>
    <p v-if="error" class="app-select__error">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.app-select {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  &__label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text);
  }

  &__wrap {
    position: relative;
  }

  &__field {
    width: 100%;
    padding: var(--space-3) var(--space-6) var(--space-3) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: 1rem;
    font-family: inherit;
    color: var(--color-text);
    appearance: none;
    cursor: pointer;
    transition: border-color var(--transition);

    &:hover:not(:disabled) {
      border-color: var(--color-primary);
    }

    &:disabled {
      background: var(--color-bg);
      cursor: not-allowed;
    }

    &--placeholder {
      color: var(--color-text-muted);
    }
  }

  &__chevron {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  &__error {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-danger);
  }
}
</style>
