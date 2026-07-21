<script setup lang="ts">
interface Props {
  modelValue: boolean
  title?: string
  /** bottom sheet on mobile, side panel on larger screens */
  side?: 'bottom' | 'right'
}

const props = withDefaults(defineProps<Props>(), { title: undefined, side: 'bottom' })

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function close(): void {
  emit('update:modelValue', false)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (!import.meta.client) return
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => {
  if (import.meta.client) {
    document.body.style.overflow = ''
    document.removeEventListener('keydown', onKeydown)
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="modelValue" class="drawer__overlay" @click.self="close">
        <Transition name="drawer-slide" appear>
          <div
            class="drawer__panel"
            :class="`drawer__panel--${side}`"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
          >
            <div class="drawer__header">
              <h3 class="drawer__title">{{ title }}</h3>
              <button type="button" class="drawer__close" aria-label="Փակել" @click="close">
                <AppIcon name="close" :size="22" />
              </button>
            </div>
            <div class="drawer__body">
              <slot />
            </div>
            <div v-if="$slots.footer" class="drawer__footer">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.drawer {
  &__overlay {
    position: fixed;
    inset: 0;
    background: rgba(13, 33, 54, 0.5);
    z-index: 100;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  &__panel {
    background: var(--color-surface);
    width: 100%;
    max-height: 85dvh;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;

    &--right {
      @media (min-width: 640px) {
        margin-left: auto;
        height: 100dvh;
        max-height: none;
        max-width: 400px;
        border-radius: 0;
      }
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }

  &__title {
    margin: 0;
    font-size: 1.1rem;
  }

  &__close {
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

  &__body {
    padding: var(--space-4);
    overflow-y: auto;
    flex: 1;
  }

  &__footer {
    padding: var(--space-4);
    border-top: 1px solid var(--color-border);
  }
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.25s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateY(100%);
}
</style>
