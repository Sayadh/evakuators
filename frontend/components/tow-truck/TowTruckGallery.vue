<script setup lang="ts">
interface Props {
  images: string[]
  alt: string
}

const props = defineProps<Props>()

const activeIndex = ref(0)
const isLightboxOpen = ref(false)

const activeImage = computed(() => props.images[activeIndex.value] ?? props.images[0])
const hasMultiple = computed(() => props.images.length > 1)

function openLightbox(index: number): void {
  activeIndex.value = index
  isLightboxOpen.value = true
}

function closeLightbox(): void {
  isLightboxOpen.value = false
}

function showNext(): void {
  activeIndex.value = (activeIndex.value + 1) % props.images.length
}

function showPrev(): void {
  activeIndex.value = (activeIndex.value - 1 + props.images.length) % props.images.length
}

function onKeydown(event: KeyboardEvent): void {
  if (!isLightboxOpen.value) return
  if (event.key === 'Escape') closeLightbox()
  else if (event.key === 'ArrowRight' && hasMultiple.value) showNext()
  else if (event.key === 'ArrowLeft' && hasMultiple.value) showPrev()
}

// Swipe support for touch devices — a plain click handler isn't enough on mobile.
let touchStartX = 0
function onTouchStart(event: TouchEvent): void {
  touchStartX = event.changedTouches[0]?.clientX ?? 0
}
function onTouchEnd(event: TouchEvent): void {
  if (!hasMultiple.value) return
  const touchEndX = event.changedTouches[0]?.clientX ?? 0
  const delta = touchEndX - touchStartX
  const SWIPE_THRESHOLD = 40
  if (delta > SWIPE_THRESHOLD) showPrev()
  else if (delta < -SWIPE_THRESHOLD) showNext()
}

watch(isLightboxOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="gallery">
    <button
      type="button"
      class="gallery__main-wrap"
      :aria-label="`Բացել ${alt} նկարը մեծ պատուհանում`"
      @click="openLightbox(activeIndex)"
    >
      <NuxtImg
        :src="activeImage"
        :alt="alt"
        class="gallery__main"
        fill
        sizes="100vw md:800px"
        format="webp"
        :preload="true"
      />
      <span class="gallery__zoom-hint">
        <AppIcon name="zoom-in" :size="18" />
      </span>
    </button>

    <div v-if="hasMultiple" class="gallery__thumbs" role="tablist" aria-label="Նկարներ">
      <button
        v-for="(image, index) in images"
        :key="image"
        type="button"
        class="gallery__thumb"
        :class="{ 'gallery__thumb--active': index === activeIndex }"
        role="tab"
        :aria-selected="index === activeIndex"
        :aria-label="`Նկար ${index + 1}`"
        @click="activeIndex = index"
      >
        <NuxtImg
          :src="image"
          :alt="`${alt} — նկար ${index + 1}`"
          width="120"
          height="90"
          loading="lazy"
          format="webp"
        />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="isLightboxOpen"
        class="gallery__lightbox"
        role="dialog"
        aria-modal="true"
        :aria-label="alt"
        @keydown="onKeydown"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
        @click.self="closeLightbox"
      >
        <button type="button" class="gallery__lightbox-close" aria-label="Փակել" @click="closeLightbox">
          <AppIcon name="close" :size="26" />
        </button>

        <button
          v-if="hasMultiple"
          type="button"
          class="gallery__lightbox-nav gallery__lightbox-nav--prev"
          aria-label="Նախորդ նկարը"
          @click.stop="showPrev"
        >
          <AppIcon name="chevron-left" :size="28" />
        </button>

        <img :src="activeImage" :alt="alt" class="gallery__lightbox-img" @click.stop>

        <button
          v-if="hasMultiple"
          type="button"
          class="gallery__lightbox-nav gallery__lightbox-nav--next"
          aria-label="Հաջորդ նկարը"
          @click.stop="showNext"
        >
          <AppIcon name="chevron-right" :size="28" />
        </button>

        <p v-if="hasMultiple" class="gallery__lightbox-count">
          {{ activeIndex + 1 }} / {{ images.length }}
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.gallery {
  &__main-wrap {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 420px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: none;
    padding: 0;
    cursor: zoom-in;
    background: var(--color-bg);
  }

  &__main {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__zoom-hint {
    position: absolute;
    bottom: var(--space-3);
    right: var(--space-3);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(13, 33, 54, 0.6);
    color: #fff;
    pointer-events: none;
  }

  &__thumbs {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
    overflow-x: auto;
    padding-bottom: var(--space-1);
  }

  &__thumb {
    flex-shrink: 0;
    padding: 0;
    border: 2px solid transparent;
    border-radius: var(--radius-sm);
    overflow: hidden;
    cursor: pointer;
    background: none;
    opacity: 0.7;
    transition:
      opacity var(--transition),
      border-color var(--transition);

    img {
      display: block;
      width: 96px;
      height: 72px;
      object-fit: cover;
    }

    &:hover {
      opacity: 1;
    }

    &--active {
      border-color: var(--color-accent);
      opacity: 1;
    }
  }

  &__lightbox {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(8, 18, 30, 0.92);
    touch-action: pan-y;
  }

  &__lightbox-img {
    max-width: min(92vw, 1100px);
    max-height: 86vh;
    object-fit: contain;
    border-radius: var(--radius-sm);
  }

  &__lightbox-close {
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

  &__lightbox-nav {
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

  &__lightbox-count {
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
