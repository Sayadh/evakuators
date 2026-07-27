<script setup lang="ts">
import { ANALYTICS_CHART_METRICS } from '~/constants/analytics'
import type { AnalyticsCharts } from '~/types/analytics'
import { AnalyticsEventType } from '~/types/enums'
import { formatCount, formatDateKeyLong, formatDateKeyShort } from '~/utils/formatters'

/**
 * Daily bar chart for 7 / 30 / 90 days — hand-rolled SVG, no charting library.
 *
 * Why no dependency: the whole requirement is "one series of non-negative
 * integers over consecutive days". Chart.js would add ~60KB to a page a driver
 * opens on mobile and force client-only rendering, to draw rectangles. This
 * renders during SSR, themes itself from the existing CSS custom properties,
 * and needs zero JavaScript to be readable.
 *
 * Accessibility/interaction without JS: each bar carries a native `<title>`, so
 * hovering shows "27 հուլիսի: 12" in every browser and screen readers announce
 * it — no tooltip state, no event listeners, no layout measurement.
 */
interface Props {
  charts: AnalyticsCharts
}

const props = defineProps<Props>()

const selectedMetric = ref<AnalyticsEventType>(AnalyticsEventType.PageView)

/** SVG user-space geometry. Fixed viewBox + width:100% = responsive, no JS resize. */
const GEOMETRY = {
  width: 720,
  height: 240,
  padding: { top: 16, right: 8, bottom: 26, left: 40 },
} as const

const plot = computed(() => ({
  width: GEOMETRY.width - GEOMETRY.padding.left - GEOMETRY.padding.right,
  height: GEOMETRY.height - GEOMETRY.padding.top - GEOMETRY.padding.bottom,
}))

const series = computed(() =>
  props.charts.points.map((point) => ({
    date: point.date,
    value: point.events[selectedMetric.value],
  })),
)

const total = computed(() => series.value.reduce((sum, point) => sum + point.value, 0))

/**
 * Y axis top. Never 0 — an all-zero series must still render a baseline and a
 * "0" gridline rather than dividing by zero and producing NaN bar heights.
 */
const maxValue = computed(() => Math.max(1, ...series.value.map((point) => point.value)))

/** Three reference lines: 0, half, max. More would be noise at this size. */
const gridLines = computed(() =>
  [0, 0.5, 1].map((ratio) => ({
    value: Math.round(maxValue.value * ratio),
    y: GEOMETRY.padding.top + plot.value.height * (1 - ratio),
  })),
)

const bars = computed(() => {
  const count = series.value.length || 1
  const slot = plot.value.width / count
  // 62% of the slot keeps a visible gap at 7 days and stays ≥1px at 90 days.
  const barWidth = Math.max(1, slot * 0.62)

  return series.value.map((point, index) => {
    const height = (point.value / maxValue.value) * plot.value.height
    return {
      ...point,
      x: GEOMETRY.padding.left + slot * index + (slot - barWidth) / 2,
      // Zero-value days get a 2px stub so the day is still visibly present on
      // the axis instead of looking like missing data.
      y: GEOMETRY.padding.top + plot.value.height - Math.max(height, point.value > 0 ? 2 : 0),
      width: barWidth,
      height: Math.max(height, point.value > 0 ? 2 : 0),
    }
  })
})

/**
 * At most ~7 x-axis labels regardless of period, so 90 days doesn't turn the
 * axis into an unreadable smear. Always includes the last day.
 */
const xLabels = computed(() => {
  const step = Math.max(1, Math.ceil(series.value.length / 7))
  return bars.value.filter(
    (_, index) => index % step === 0 || index === series.value.length - 1,
  )
})

const baselineY = computed(() => GEOMETRY.padding.top + plot.value.height)
</script>

<template>
  <section class="analytics-chart">
    <header class="analytics-chart__head">
      <div class="analytics-chart__tabs" role="tablist" aria-label="Ցուցանիշ">
        <button
          v-for="metric in ANALYTICS_CHART_METRICS"
          :key="metric.eventType"
          type="button"
          role="tab"
          :aria-selected="selectedMetric === metric.eventType"
          class="analytics-chart__tab"
          :class="{ 'analytics-chart__tab--active': selectedMetric === metric.eventType }"
          @click="selectedMetric = metric.eventType"
        >
          {{ metric.label }}
        </button>
      </div>
      <p class="analytics-chart__total">
        Ընտրված ժամանակահատվածում՝ <strong>{{ formatCount(total) }}</strong>
      </p>
    </header>

    <svg
      class="analytics-chart__svg"
      :viewBox="`0 0 ${GEOMETRY.width} ${GEOMETRY.height}`"
      role="img"
      :aria-label="`Օրական վիճակագրություն ${charts.range.from} — ${charts.range.to}`"
    >
      <g class="analytics-chart__grid">
        <template v-for="line in gridLines" :key="line.y">
          <line
            :x1="GEOMETRY.padding.left"
            :x2="GEOMETRY.width - GEOMETRY.padding.right"
            :y1="line.y"
            :y2="line.y"
          />
          <text :x="GEOMETRY.padding.left - 6" :y="line.y + 4" text-anchor="end">
            {{ line.value }}
          </text>
        </template>
      </g>

      <g class="analytics-chart__bars">
        <rect
          v-for="bar in bars"
          :key="bar.date"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          rx="2"
        >
          <title>{{ formatDateKeyLong(bar.date) }}: {{ bar.value }}</title>
        </rect>
      </g>

      <g class="analytics-chart__x-labels">
        <text
          v-for="bar in xLabels"
          :key="`label-${bar.date}`"
          :x="bar.x + bar.width / 2"
          :y="baselineY + 16"
          text-anchor="middle"
        >
          {{ formatDateKeyShort(bar.date) }}
        </text>
      </g>
    </svg>
  </section>
</template>

<style scoped lang="scss">
.analytics-chart {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);

  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  &__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  &__tab {
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--transition),
      color var(--transition),
      border-color var(--transition);

    &:hover {
      border-color: var(--color-primary-light);
      color: var(--color-primary);
    }

    &--active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #fff;
    }
  }

  &__total {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  &__svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }

  &__grid {
    line {
      stroke: var(--color-border);
      stroke-width: 1;
    }

    text {
      fill: var(--color-text-muted);
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }
  }

  &__bars rect {
    fill: var(--color-primary-light);
    transition: fill var(--transition);

    &:hover {
      fill: var(--color-accent);
    }
  }

  &__x-labels text {
    fill: var(--color-text-muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
}
</style>
