<script setup lang="ts">
interface Props {
  modelValue: boolean
  label: string
}

defineProps<Props>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const id = useId()
</script>

<template>
  <label :for="id" class="app-checkbox">
    <input
      :id="id"
      type="checkbox"
      class="app-checkbox__input"
      :checked="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span class="app-checkbox__box" aria-hidden="true">
      <AppIcon v-if="modelValue" name="check" :size="14" />
    </span>
    <span class="app-checkbox__label">{{ label }}</span>
  </label>
</template>

<style scoped lang="scss">
.app-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) 0;

  &__input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;

    &:focus-visible + .app-checkbox__box {
      outline: 3px solid rgba(20, 48, 79, 0.45);
      outline-offset: 2px;
    }
  }

  &__box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border: 2px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-surface);
    color: #fff;
    transition:
      background var(--transition),
      border-color var(--transition);
  }

  &__input:checked + &__box {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  &__label {
    font-size: 0.95rem;
  }
}
</style>
