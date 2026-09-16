<script setup lang="ts">
import { ANALYTICS_OVERVIEW_CARDS, type AnalyticsCardDefinition } from '~/constants/analytics'
import type { AnalyticsOverview } from '~/types/analytics'
import { formatCount } from '~/utils/formatters'

/**
 * The overview numbers. Markup is driven entirely by
 * ANALYTICS_OVERVIEW_CARDS — adding or reordering a metric is a change to that
 * constant, never to this template.
 *
 * Each card declares where its numbers come from (`source`), and both readers
 * below switch on that exhaustively. The `never` in the default arm is what
 * makes adding a source kind a compile error here instead of a card that
 * quietly renders somebody else's number.
 */
interface Props {
  overview: AnalyticsOverview
}

const props = defineProps<Props>()

/** Value inside the selected period */
function periodValue(card: AnalyticsCardDefinition): number {
  switch (card.source.kind) {
    case 'event':
      return props.overview.totals[card.source.eventType]
    case 'uniqueVisitors':
      return props.overview.uniqueVisitors
    case 'dispatches':
      return props.overview.dispatches.period
  }
}

/**
 * Lifetime value, or null where none exists.
 *
 * Unique visitors deliberately has none: the per-visitor ledger it is computed
 * from is purged on a retention schedule, so an "all-time unique visitors"
 * number would quietly shrink over time, and showing nothing is more honest
 * than showing a number that decreases (see docs/analytics.md). Referrals have
 * one — `DispatchReferral` rows are never purged.
 */
function allTimeValue(card: AnalyticsCardDefinition): number | null {
  switch (card.source.kind) {
    case 'event':
      return props.overview.allTimeTotals[card.source.eventType]
    case 'uniqueVisitors':
      return null
    case 'dispatches':
      return props.overview.dispatches.allTime
  }
}

/** True for the one card whose number is period-only, so the row can say so */
function isPeriodOnly(card: AnalyticsCardDefinition): boolean {
  return card.source.kind === 'uniqueVisitors'
}
</script>

<template>
  <div class="analytics-cards">
    <article v-for="card in ANALYTICS_OVERVIEW_CARDS" :key="card.id" class="analytics-card">
      <header class="analytics-card__head">
        <span class="analytics-card__icon"><AppIcon :name="card.icon" :size="18" /></span>
        <h4 class="analytics-card__label">{{ card.label }}</h4>
      </header>

      <p class="analytics-card__value">{{ formatCount(periodValue(card)) }}</p>

      <p v-if="allTimeValue(card) !== null" class="analytics-card__all-time">
        Ընդհանուր՝ <strong>{{ formatCount(allTimeValue(card) ?? 0) }}</strong>
      </p>
      <p v-else-if="isPeriodOnly(card)" class="analytics-card__all-time">
        միայն ընտրված ժամանակահատվածի համար
      </p>

      <p class="analytics-card__hint">{{ card.hint }}</p>
    </article>
  </div>
</template>

<style scoped lang="scss">
.analytics-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);

  @media (min-width: 768px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.analytics-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);

  &__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    border-radius: var(--radius-sm);
    background: rgba(20, 48, 79, 0.08);
    color: var(--color-primary);
  }

  &__label {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  &__value {
    margin: 0;
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 800;
    line-height: 1.1;
    color: var(--color-primary);
    /* Tabular figures keep the six cards' numbers optically aligned */
    font-variant-numeric: tabular-nums;
  }

  &__all-time {
    margin: var(--space-1) 0 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  &__hint {
    margin: var(--space-2) 0 0;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--color-text-muted);
  }
}
</style>
