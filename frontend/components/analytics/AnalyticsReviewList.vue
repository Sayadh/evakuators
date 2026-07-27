<script setup lang="ts">
import type { AnalyticsReviews } from '~/types/analytics'
import { formatCount } from '~/utils/formatters'

/**
 * The driver's own reviews, including ones an admin hasn't published yet.
 *
 * Unlike TowTruckReviews.vue (public profile, approved only), this list is only
 * ever rendered behind driver or admin auth — which is what makes showing
 * unmoderated text here acceptable.
 */
interface Props {
  reviews: AnalyticsReviews
}

const props = defineProps<Props>()

const counters = computed(() => props.reviews.counters)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hy-AM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <section class="review-list">
    <div class="review-list__counters">
      <span class="review-list__counter">
        Ընդհանուր՝ <strong>{{ formatCount(counters.total) }}</strong>
      </span>
      <span class="review-list__counter review-list__counter--confirmed">
        Հաստատված՝ <strong>{{ formatCount(counters.confirmed) }}</strong>
      </span>
      <span class="review-list__counter review-list__counter--pending">
        Սպասող՝ <strong>{{ formatCount(counters.pending) }}</strong>
      </span>
    </div>

    <p v-if="reviews.items.length === 0" class="review-list__empty">Դեռ կարծիքներ չկան։</p>

    <ul v-else class="review-list__items">
      <li
        v-for="review in reviews.items"
        :key="review.id"
        class="review-list__item"
        :class="{ 'review-list__item--pending': !review.isConfirmed }"
      >
        <header class="review-list__item-head">
          <div>
            <strong>{{ review.authorName }}</strong>
            <span v-if="review.cityName" class="review-list__muted"> · {{ review.cityName }}</span>
          </div>
          <div class="review-list__badges">
            <span class="review-list__rating">
              {{ review.rating }} <AppIcon name="star-filled" :size="12" />
            </span>
            <AppBadge :variant="review.isConfirmed ? 'success' : 'accent'">
              {{ review.isConfirmed ? 'Հաստատված' : 'Սպասում է' }}
            </AppBadge>
          </div>
        </header>

        <p class="review-list__text">{{ review.text }}</p>
        <p class="review-list__muted review-list__date">{{ formatDate(review.createdAt) }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.review-list {
  &__counters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  &__counter--confirmed strong {
    color: var(--color-success);
  }

  &__counter--pending strong {
    color: var(--color-accent-dark);
  }

  &__empty {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  &__items {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__item {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    background: var(--color-surface);

    /* Unpublished reviews are visually set apart so a driver never mistakes one
       for something a customer can already see on their profile. */
    &--pending {
      border-style: dashed;
      background: rgba(246, 168, 33, 0.05);
    }
  }

  &__item-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  &__badges {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__rating {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--color-accent-dark);
  }

  &__text {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.5;
  }

  &__muted {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }

  &__date {
    margin: var(--space-2) 0 0;
  }
}
</style>
