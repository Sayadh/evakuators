<script setup lang="ts">
interface Props {
  modelValue: boolean
  title?: string
}

withDefaults(defineProps<Props>(), { title: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function close(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal__overlay" @click.self="close">
        <div class="modal__panel" role="dialog" aria-modal="true" :aria-label="title">
          <button type="button" class="modal__close" aria-label="Փակել" @click="close">
            <AppIcon name="close" :size="22" />
          </button>
          <h3 v-if="title" class="modal__title">{{ title }}</h3>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.modal {
  &__overlay {
    position: fixed;
    inset: 0;
    background: rgba(13, 33, 54, 0.5);
    z-index: 110;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  &__panel {
    position: relative;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-6);
    max-width: 480px;
    width: 100%;
    max-height: 85dvh;
    overflow-y: auto;
  }

  &__close {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    display: inline-flex;
    padding: var(--space-2);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--color-bg);
    }
  }

  &__title {
    margin-bottom: var(--space-3);
    padding-right: var(--space-6);
  }
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
