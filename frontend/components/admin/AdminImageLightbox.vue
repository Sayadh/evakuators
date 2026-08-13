<script setup lang="ts">
/**
 * Full-size viewer for the thumbnail grids in the moderation panel.
 *
 * An admin deciding on a request needs to actually see what was uploaded, not
 * a 108px thumbnail. It lived inline in `/admin` until the review page at
 * `/admin/registrations/:id` needed the same thing; a second copy of an
 * overlay that listens on `document` and locks body scroll is exactly the kind
 * of duplication that ends with one copy leaving the page unscrollable.
 *
 * See `TowTruckGallery.vue` for the same pattern on the public site — kept
 * separate because that one is part of a driver's profile layout and this one
 * is a bare overlay.
 */
const open = defineModel<boolean>({ required: true })

const props = withDefaults(
  defineProps<{
    images: string[]
    /** Which image the grid was clicked on */
    startIndex?: number
  }>(),
  { startIndex: 0 },
)

const index = ref(props.startIndex)

// Re-seeded on every open rather than watched continuously: the grid sets the
// index and the modal takes over from there, so following `startIndex` while
// open would snap the viewer back the moment the parent re-rendered.
watch(open, (isOpen) => {
  if (isOpen) index.value = props.startIndex
})

const current = computed(() => props.images[index.value] ?? '')
const hasMultiple = computed(() => props.images.length > 1)

function close(): void {
  open.value = false
}

function next(): void {
  index.value = (index.value + 1) % props.images.length
}

function prev(): void {
  index.value = (index.value - 1 + props.images.length) % props.images.length
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowRight' && hasMultiple.value) next()
  else if (event.key === 'ArrowLeft' && hasMultiple.value) prev()
}

// A Teleport'd overlay never holds document focus, so a `@keydown` bound on
// the div itself would never fire — listen on `document` instead (see the
// same pattern in AppDrawer.vue) and only while the lightbox is actually open.
watch(open, (isOpen) => {
  if (!import.meta.client) return
  document.body.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="admin-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Նկարի մեծացված տեսք"
      @click.self="close"
    >
      <button type="button" class="admin-lightbox__close" aria-label="Փակել" @click="close">
        <AppIcon name="close" :size="26" />
      </button>

      <button
        v-if="hasMultiple"
        type="button"
        class="admin-lightbox__nav admin-lightbox__nav--prev"
        aria-label="Նախորդ նկարը"
        @click.stop="prev"
      >
        <AppIcon name="chevron-left" :size="28" />
      </button>

      <img :src="current" alt="" class="admin-lightbox__img" @click.stop>

      <button
        v-if="hasMultiple"
        type="button"
        class="admin-lightbox__nav admin-lightbox__nav--next"
        aria-label="Հաջորդ նկարը"
        @click.stop="next"
      >
        <AppIcon name="chevron-right" :size="28" />
      </button>

      <p v-if="hasMultiple" class="admin-lightbox__count">
        {{ index + 1 }} / {{ images.length }}
      </p>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.admin-lightbox {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 18, 30, 0.92);

  &__img {
    max-width: min(92vw, 1100px);
    max-height: 86vh;
    object-fit: contain;
    border-radius: var(--radius-sm);
  }

  &__close {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.22);
    }
  }

  &__nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.22);
    }

    &--prev {
      left: var(--space-3);
    }

    &--next {
      right: var(--space-3);
    }

    @media (min-width: 640px) {
      width: 52px;
      height: 52px;
    }
  }

  &__count {
    position: absolute;
    bottom: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 0.85rem;
  }
}
</style>
