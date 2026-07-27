<script setup lang="ts">
import { ANALYTICS_DEFAULT_PERIOD, ANALYTICS_PERIOD_OPTIONS } from '~/constants/analytics'
import {
  adminAnalyticsRepository,
  myAnalyticsRepository,
  type AnalyticsReportsApi,
} from '~/repositories'
import type {
  AnalyticsCharts,
  AnalyticsOverview,
  AnalyticsRatings,
  AnalyticsReviews,
} from '~/types/analytics'
import type { AnalyticsPeriod } from '~/types/enums'
import { extractErrorMessage } from '~/utils/errors'

/**
 * The whole analytics dashboard — used verbatim by the driver's own `/dashboard`
 * and by `/admin` for any tow truck.
 *
 * ## Why one component for both audiences
 *
 * A driver and an admin must see *the same numbers computed the same way*; two
 * components would be two chances for them to disagree, and "the driver says 40
 * views, the admin panel says 37" is an unfalsifiable support ticket. The only
 * difference between the two cases is which endpoint the data comes from, so
 * that — and only that — is what `scope` selects. Everything downstream
 * (cards, chart, ratings, review list) is identical by construction.
 *
 * This mirrors the backend exactly: one AnalyticsDashboardService, two thin
 * controllers differing only in how the tow truck id is authorised.
 */
interface Props {
  /**
   * 'driver' reads /my/analytics — the id comes from the driver's JWT and is
   * never sent by this component. 'admin' reads
   * /admin/tow-trucks/:towTruckId/analytics.
   */
  scope: 'driver' | 'admin'
  /** Required when scope is 'admin', ignored otherwise */
  towTruckId?: number
}

const props = withDefaults(defineProps<Props>(), { towTruckId: undefined })

/**
 * Rebuilt when the target changes so switching admin rows can't ever leave a
 * stale repository bound to the previous truck.
 */
const reports = computed<AnalyticsReportsApi>(() =>
  props.scope === 'admin' && props.towTruckId !== undefined
    ? adminAnalyticsRepository.forTowTruck(props.towTruckId)
    : myAnalyticsRepository,
)

const period = ref<AnalyticsPeriod>(ANALYTICS_DEFAULT_PERIOD)

/** AppSelect speaks plain strings; the cast is contained to this one adapter */
const periodValue = computed({
  get: () => period.value as string,
  set: (value: string) => {
    period.value = value as AnalyticsPeriod
  },
})

const overview = ref<AnalyticsOverview | null>(null)
const charts = ref<AnalyticsCharts | null>(null)
const reviews = ref<AnalyticsReviews | null>(null)
const ratings = ref<AnalyticsRatings | null>(null)

const loading = ref(true)
const loadError = ref('')

/**
 * Overview and charts are period-scoped, so they reload whenever the switcher
 * changes. Reviews and ratings are not — a review from four months ago is still
 * current reputation — so they load once and are left alone, which keeps a
 * period change to two requests instead of four.
 */
async function loadPeriodData(): Promise<void> {
  const [overviewResult, chartsResult] = await Promise.all([
    reports.value.getOverview(period.value),
    reports.value.getCharts(period.value),
  ])
  overview.value = overviewResult
  charts.value = chartsResult
}

async function loadCustomerActivity(): Promise<void> {
  const [reviewsResult, ratingsResult] = await Promise.all([
    reports.value.getReviews(),
    reports.value.getRatings(),
  ])
  reviews.value = reviewsResult
  ratings.value = ratingsResult
}

async function loadAll(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    await Promise.all([loadPeriodData(), loadCustomerActivity()])
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Վիճակագրությունը բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
  }
}

async function reloadPeriodData(): Promise<void> {
  loadError.value = ''
  try {
    await loadPeriodData()
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Վիճակագրությունը բեռնել չհաջողվեց։')
  }
}

onMounted(() => {
  void loadAll()
})

watch(period, () => {
  void reloadPeriodData()
})

// Admin panel keeps one instance per expanded row, but re-targeting is cheap to
// support and prevents a subtle "shows the previous driver's numbers" bug if the
// panel is ever reused.
watch(
  () => props.towTruckId,
  () => {
    void loadAll()
  },
)
</script>

<template>
  <div class="analytics-dashboard">
    <header class="analytics-dashboard__head">
      <div>
        <h3 class="analytics-dashboard__title">Վիճակագրություն</h3>
        <p v-if="overview" class="analytics-dashboard__range">
          {{ overview.range.from }} — {{ overview.range.to }} ({{ overview.range.days }} օր)
        </p>
      </div>
      <AppSelect
        v-model="periodValue"
        :options="ANALYTICS_PERIOD_OPTIONS"
        placeholder="Ժամանակահատված"
        class="analytics-dashboard__period"
      />
    </header>

    <p v-if="loadError" class="analytics-dashboard__error">{{ loadError }}</p>

    <LoadingSkeleton v-if="loading" variant="text" :count="4" />

    <template v-else-if="overview">
      <AnalyticsOverviewCards :overview="overview" />

      <AnalyticsChart v-if="charts" :charts="charts" class="analytics-dashboard__block" />

      <div class="analytics-dashboard__activity">
        <section v-if="ratings" class="analytics-dashboard__panel">
          <h4 class="analytics-dashboard__panel-title">Գնահատականներ</h4>
          <AnalyticsRatingBars :ratings="ratings" />
        </section>

        <section v-if="reviews" class="analytics-dashboard__panel">
          <h4 class="analytics-dashboard__panel-title">Կարծիքներ</h4>
          <AnalyticsReviewList :reviews="reviews" />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.analytics-dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3);
  }

  &__title {
    margin: 0;
  }

  &__range {
    margin: 2px 0 0;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  &__period {
    min-width: 190px;
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
  }

  &__block {
    margin: 0;
  }

  &__activity {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);

    @media (min-width: 900px) {
      grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
      align-items: start;
    }
  }

  &__panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }

  &__panel-title {
    margin: 0 0 var(--space-3);
    font-size: 1rem;
  }
}
</style>
