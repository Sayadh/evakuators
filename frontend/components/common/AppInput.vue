<script setup lang="ts">
interface Props {
  modelValue: string
  label?: string
  type?: 'text' | 'tel' | 'email' | 'number' | 'password'
  placeholder?: string
  required?: boolean
  error?: string
}

withDefaults(defineProps<Props>(), {
  label: undefined,
  type: 'text',
  placeholder: '',
  required: false,
  error: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()

const id = useId()

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="app-input">
    <label v-if="label" :for="id" class="app-input__label">
      {{ label }}<span v-if="required" class="app-input__required" aria-hidden="true"> *</span>
    </label>
    <input
      :id="id"
      class="app-input__field"
      :class="{ 'app-input__field--error': error }"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :aria-invalid="Boolean(error)"
      @input="onInput"
      @blur="emit('blur')"
    >
    <p v-if="error" class="app-input__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
.app-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);

  &__label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__required {
    color: var(--color-danger);
  }

  &__field {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    transition: border-color var(--transition);

    &:hover,
    &:focus {
      border-color: var(--color-primary);
    }

    &--error {
      border-color: var(--color-danger);
    }
  }

  &__error {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-danger);
  }
}
</style>
