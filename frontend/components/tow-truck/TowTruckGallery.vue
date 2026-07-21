<script setup lang="ts">
interface Props {
  images: string[]
  alt: string
}

const props = defineProps<Props>()

const activeIndex = ref(0)

const activeImage = computed(() => props.images[activeIndex.value] ?? props.images[0])
</script>

<template>
  <div class="gallery">
    <NuxtImg
      :src="activeImage"
      :alt="alt"
      class="gallery__main"
      width="800"
      height="450"
      format="webp"
      :preload="true"
    />
    <div v-if="images.length > 1" class="gallery__thumbs" role="tablist" aria-label="Նկարներ">
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
  </div>
</template>

<style scoped lang="scss">
.gallery {
  &__main {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--radius-lg);
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
}
</style>
