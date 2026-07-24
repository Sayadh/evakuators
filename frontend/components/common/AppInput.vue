<script setup lang="ts">
interface Props {
  modelValue: string
  label?: string
  type?: 'text' | 'tel' | 'email' | 'number' | 'password' | 'date' | 'time'
  placeholder?: string
  required?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  type: 'text',
  placeholder: '',
  required: false,
  error: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>()

const id = useId()
const inputRef = ref<HTMLInputElement | null>(null)

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

/**
 * Native <input type="time"/"date"> only pops the browser's picker UI when
 * you click the small calendar/clock glyph — clicking the rest of the field
 * just places a text cursor in a segment, which looks like nothing happened.
 * showPicker() makes a click anywhere in the field behave the same as
 * clicking the icon. Only valid for date/time-like input types (calling it
 * on type="text" etc. throws), and wrapped defensively since Safari only
 * added support fairly recently — worst case it just falls back to the
 * default (icon-only) behavior there.
 */
function onClick(): void {
  if (props.type !== 'time' && props.type !== 'date') return
  try {
    inputRef.value?.showPicker?.()
  } catch {
    // Unsupported in this browser — default icon-click behavior still works.
  }
}
</script>

<template>
  <div class="app-input">
    <label v-if="label" :for="id" class="app-input__label">
      {{ label }}<span v-if="required" class="app-input__required" aria-hidden="true"> *</span>
    </label>
    <input
      :id="id"
      ref="inputRef"
      class="app-input__field"
      :class="{ 'app-input__field--error': error }"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :aria-invalid="Boolean(error)"
      @input="onInput"
      @blur="emit('blur')"
      @click="onClick"
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

    // Remove native number spinner arrows everywhere this component is used.
    &[type='number'] {
      -moz-appearance: textfield;

      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    }
  }

  &__error {
    margin: 0;
    font-size: 0.82rem;
    color: var(--color-danger);
  }
}
</style>
