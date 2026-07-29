<script setup lang="ts">
import { adminSiteAnalyticsRepository } from '~/repositories'
import type { SiteAnalyticsOverview } from '~/types/analytics'
import { AnalyticsPeriod, SiteEventType } from '~/types/enums'
import { extractErrorMessage } from '~/utils/errors'

/**
 * The platform's own traffic, for the admin panel: how many people opened the
 * site, and how many opened Ազատ երթուղիներ.
 *
 * Deliberately NOT `AnalyticsDashboard` with a third scope. That component is
 * built around one tow truck's five event types, its cards, its chart and its
 * reviews; this is two numbers about the site with none of that shape in
 * common. Bending it to serve both would mean a component whose every section
 * is conditional on which mode it's in.
 */
const PERIOD_OPTIONS = [
  { value: AnalyticsPeriod.Last7Days, label: '7 օր' },
  { value: AnalyticsPeriod.Last30Days, label: '30 օր' },
  { value: AnalyticsPeriod.Last90Days, label: '90 օր' },
]

const period = ref<AnalyticsPeriod>(AnalyticsPeriod.Last30Days)
const overview = ref<SiteAnalyticsOverview | null>(null)
const loading = ref(false)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    overview.value = await adminSiteAnalyticsRepository.getOverview(period.value)
  } catch (err) {
    error.value = extractErrorMessage(err, 'Վիճակագրությունը բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
  }
}

// Refetch on switch, and immediately on mount — `immediate` rather than a
// separate onMounted call so there is one code path, not two that can diverge.
watch(period, load, { immediate: true })

interface Metric {
  label: string
  /** Distinct people over the whole window — the headline number */
  unique: number
  /** Sum of daily deduplicated counts — returning visitors counted per day */
  visits: number
  allTime: number
}

const metrics = computed<Metric[]>(() => {
  const data = overview.value
  if (!data) return []
  return [
    {
      label: 'Մուտք կայք',
      unique: data.uniqueVisitors[SiteEventType.SiteVisit],
      visits: data.totals[SiteEventType.SiteVisit],
      allTime: data.allTimeTotals[SiteEventType.SiteVisit],
    },
    {
      label: 'Ազատ երթուղիներ',
      unique: data.uniqueVisitors[SiteEventType.FreeRoutesView],
      visits: data.totals[SiteEventType.FreeRoutesView],
      allTime: data.allTimeTotals[SiteEventType.FreeRoutesView],
    },
  ]
})
</script>

<template>
  <div class="site-analytics">
    <div class="site-analytics__periods">
      <AppButton
        v-for="option in PERIOD_OPTIONS"
        :key="option.value"
        :variant="period === option.value ? 'primary' : 'outline'"
        size="sm"
        :disabled="loading"
        @click="period = option.value"
      >
        {{ option.label }}
      </AppButton>
    </div>

    <LoadingSkeleton v-if="loading && !overview" variant="text" :count="3" />
    <p v-else-if="error" class="site-analytics__error">{{ error }}</p>

    <div v-else-if="overview" class="site-analytics__grid">
      <div v-for="metric in metrics" :key="metric.label" class="site-analytics__card">
        <p class="site-analytics__label">{{ metric.label }}</p>
        <p class="site-analytics__value">{{ metric.unique }}</p>
        <p class="site-analytics__meta">տարբեր մարդ ընտրված ժամանակահատվածում</p>
        <dl class="site-analytics__extra">
          <div>
            <dt>Այցեր</dt>
            <dd>{{ metric.visits }}</dd>
          </div>
          <div>
            <dt>Ընդհանուր</dt>
            <dd>{{ metric.allTime }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <p class="site-analytics__note">
      Մեկ մարդը օրական մեկ անգամ է հաշվվում։ «Տարբեր մարդ»-ը ամբողջ
      ժամանակահատվածում եզակի այցելուներն են, «Այցեր»-ը՝ օրերի գումարը (նույն
      մարդը երեք տարբեր օր՝ 3 այց, բայց 1 մարդ)։ «Ընդհանուր»-ը ամբողջ պատմությունն է։
    </p>
  </div>
</template>

<style scoped lang="scss">
.site-analytics {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__periods {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);

    @media (min-width: 640px) {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  &__card {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &__label {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  &__value {
    margin: var(--space-1) 0 0;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
  }

  &__meta {
    margin: var(--space-1) 0 0;
    font-size: 0.78rem;
    color: var(--color-text-muted);
  }

  &__extra {
    display: flex;
    gap: var(--space-4);
    margin: var(--space-3) 0 0;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);

    dt {
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }

    dd {
      margin: 0;
      font-weight: 600;
    }
  }

  &__note {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }
}
</style>
