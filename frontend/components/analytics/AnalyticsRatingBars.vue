<script setup lang="ts">
import { ANALYTICS_RATING_VALUES_DESC } from '~/constants/analytics'
import type { AnalyticsRatings } from '~/types/analytics'
import { formatCount } from '~/utils/formatters'

/**
 * Rating distribution, 5→1 (the order every review UI uses), with confirmed and
 * pending shown as two segments of one bar.
 *
 * Keeping pending visible is the point: a driver who just received three
 * five-star reviews should see them arrive even though an admin hasn't published
 * them yet — otherwise the dashboard looks broken and they assume the reviews
 * were lost.
 */
interface Props {
  ratings: AnalyticsRatings
}

const props = defineProps<Props>()

/** Rows ordered high → low, with per-row totals resolved once */
const rows = computed(() =>
  ANALYTICS_RATING_VALUES_DESC.map((rating) => {
    const bucket = props.ratings.distribution.find((item) => item.rating === rating)
    const confirmed = bucket?.confirmed ?? 0
    const pending = bucket?.pending ?? 0
    return { rating, confirmed, pending, total: confirmed + pending }
  }),
)

/** Bars are scaled against the busiest row, not the grand total — a 1-vs-8 split stays legible */
const maxRowTotal = computed(() => Math.max(1, ...rows.value.map((row) => row.total)))

function widthPercent(value: number): string {
  return `${(value / maxRowTotal.value) * 100}%`
}

const hasAnyReview = computed(() => rows.value.some((row) => row.total > 0))

/** '—' rather than '0.0': no reviews means no rating, not a bad rating */
function formatAverage(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}
</script>

<template>
  <section class="rating-bars">
    <div class="rating-bars__summary">
      <div class="rating-bars__average">
        <span class="rating-bars__average-value">
          {{ formatAverage(ratings.counters.confirmedAverage) }}
        </span>
        <span class="rating-bars__average-label">
          <AppIcon name="star-filled" :size="14" />
          հրապարակված գնահատական ({{ formatCount(ratings.counters.confirmed) }})
        </span>
      </div>
      <div v-if="ratings.counters.pending > 0" class="rating-bars__average">
        <span class="rating-bars__average-value rating-bars__average-value--pending">
          {{ formatAverage(ratings.counters.pendingAverage) }}
        </span>
        <span class="rating-bars__average-label">
          սպասում է հաստատման ({{ formatCount(ratings.counters.pending) }})
        </span>
      </div>
    </div>

    <p v-if="!hasAnyReview" class="rating-bars__empty">Դեռ գնահատականներ չկան։</p>

    <ul v-else class="rating-bars__list">
      <li v-for="row in rows" :key="row.rating" class="rating-bars__row">
        <span class="rating-bars__star">{{ row.rating }} <AppIcon name="star-filled" :size="12" /></span>
        <span class="rating-bars__track">
          <span
            v-if="row.confirmed"
            class="rating-bars__fill rating-bars__fill--confirmed"
            :style="{ width: widthPercent(row.confirmed) }"
            :title="`Հրապարակված՝ ${row.confirmed}`"
          />
          <span
            v-if="row.pending"
            class="rating-bars__fill rating-bars__fill--pending"
            :style="{ width: widthPercent(row.pending) }"
            :title="`Սպասում է հաստատման՝ ${row.pending}`"
          />
        </span>
        <span class="rating-bars__count">{{ row.total }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.rating-bars {
  &__summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    margin-bottom: var(--space-4);
  }

  &__average {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__average-value {
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1;
    color: var(--color-primary);
    font-variant-numeric: tabular-nums;

    &--pending {
      color: var(--color-text-muted);
    }
  }

  &__average-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }

  &__empty {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.9rem;
  }

  &__list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__row {
    display: grid;
    grid-template-columns: 44px 1fr 32px;
    align-items: center;
    gap: var(--space-3);
  }

  &__star {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  &__track {
    display: flex;
    height: 10px;
    border-radius: var(--radius-full);
    background: var(--color-bg);
    overflow: hidden;
  }

  &__fill {
    height: 100%;

    &--confirmed {
      background: var(--color-success);
    }

    &--pending {
      background: var(--color-accent);
    }
  }

  &__count {
    font-size: 0.8rem;
    text-align: right;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }
}
</style>
