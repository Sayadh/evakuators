<script setup lang="ts">
import type { Review } from '~/types/review'

interface Props {
  reviews: Review[]
  pending?: boolean
}

const props = withDefaults(defineProps<Props>(), { pending: false })

const averageRating = computed(() => {
  if (props.reviews.length === 0) return 0
  return props.reviews.reduce((sum, review) => sum + review.rating, 0) / props.reviews.length
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hy-AM', { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>

<template>
  <section class="truck-reviews" aria-labelledby="truck-reviews-title">
    <header class="truck-reviews__header">
      <h2 id="truck-reviews-title">Կարծիքներ</h2>
      <div v-if="reviews.length > 0" class="truck-reviews__summary">
        <span class="truck-reviews__stars" aria-hidden="true">
          <AppIcon
            v-for="n in 5"
            :key="n"
            :name="n <= Math.round(averageRating) ? 'star-filled' : 'star'"
            :size="16"
          />
        </span>
        <strong>{{ averageRating.toFixed(1) }}</strong>
        <span class="truck-reviews__count">({{ reviews.length }} կարծիք)</span>
      </div>
    </header>

    <LoadingSkeleton v-if="pending" variant="text" :count="2" />

    <p v-else-if="reviews.length === 0" class="truck-reviews__empty">
      Դեռ կարծիք չկա։ Առաջինը եղեք, ով կպատմի իր փորձառության մասին։
    </p>

    <ul v-else class="truck-reviews__list">
      <li v-for="review in reviews" :key="review.id" class="truck-reviews__item">
        <div class="truck-reviews__item-header">
          <strong>{{ review.authorName }}</strong>
          <span class="truck-reviews__item-stars" aria-hidden="true">
            <AppIcon
              v-for="n in 5"
              :key="n"
              :name="n <= review.rating ? 'star-filled' : 'star'"
              :size="13"
            />
          </span>
        </div>
        <p class="truck-reviews__item-meta">
          {{ formatDate(review.date) }}<template v-if="review.cityName"> · {{ review.cityName }}</template>
        </p>
        <p class="truck-reviews__item-text">{{ review.text }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.truck-reviews {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);

    h2 {
      margin: 0;
    }
  }

  &__summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.95rem;
  }

  &__stars,
  &__item-stars {
    display: inline-flex;
    gap: 2px;
    color: var(--color-accent);
  }

  &__count {
    color: var(--color-text-secondary);
  }

  &__empty {
    color: var(--color-text-secondary);
    margin: 0;
  }

  &__list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  &__item {
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-border);

    &:last-child {
      padding-bottom: 0;
      border-bottom: none;
    }
  }

  &__item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__item-meta {
    margin: 2px 0 var(--space-2);
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  &__item-text {
    margin: 0;
    line-height: 1.6;
  }
}
</style>
