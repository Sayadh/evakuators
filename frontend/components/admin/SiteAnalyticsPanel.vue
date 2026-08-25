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
  // Today first — the one period that exists only on this panel, never on a
  // driver's own dashboard (see AnalyticsPeriod's own comment).
  { value: AnalyticsPeriod.Today, label: 'Այսօր' },
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
  /**
   * Sum of daily deduplicated counts, scoped to the selected period — the
   * SAME quantity for every card (one row per calendar day a person did the
   * thing, summed), but the word for "the thing" differs: a site visit is a
   * "visit", a phone click is not, so this ships its own label rather than a
   * hardcoded "Այցեր" that made no sense on the calls card (a driver's phone
   * getting pressed twice on different days is not two "visits").
   */
  periodLabel: string
  periodTotal: number
  /**
   * Same daily-deduplicated sum, but over the truck's/site's ENTIRE recorded
   * history — never purged, and NOT scoped by the period switcher above. This
   * is the number that keeps growing every time a person who already counted
   * as "unique" comes back on a new day, which `unique` by definition cannot
   * show (see the note at the bottom of the template).
   */
  allTime: number
}

const metrics = computed<Metric[]>(() => {
  const data = overview.value
  if (!data) return []
  return [
    {
      label: 'Մուտք կայք',
      unique: data.uniqueVisitors[SiteEventType.SiteVisit],
      periodLabel: 'Այցեր',
      periodTotal: data.totals[SiteEventType.SiteVisit],
      allTime: data.allTimeTotals[SiteEventType.SiteVisit],
    },
    {
      label: 'Ազատ երթուղիներ',
      unique: data.uniqueVisitors[SiteEventType.FreeRoutesView],
      periodLabel: 'Այցեր',
      periodTotal: data.totals[SiteEventType.FreeRoutesView],
      allTime: data.allTimeTotals[SiteEventType.FreeRoutesView],
    },
    // Not a SiteEventType — a phone click is a per-truck event read here with
    // no towTruckId filter (see SiteWideCallerStats), so it comes from a
    // separate field on the response rather than the totals/uniqueVisitors
    // maps above. Placed last: it answers a different question ("are people
    // calling drivers at all", not "did people open the site").
    {
      label: 'Ակտիվ զանգողներ',
      unique: data.callers.uniqueCallers,
      periodLabel: 'Զանգեր',
      periodTotal: data.callers.totalCalls,
      allTime: data.callers.allTimeTotalCalls,
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
            <dt>{{ metric.periodLabel }}</dt>
            <dd>{{ metric.periodTotal }}</dd>
          </div>
          <!-- The one number in the row that keeps climbing when someone
               already counted in "unique" above comes back on a new day —
               made to stand out for exactly that reason, see the note below. -->
          <div class="site-analytics__extra-highlight">
            <dt>Ընդհանուր</dt>
            <dd>{{ metric.allTime }}</dd>
          </div>
        </dl>
      </div>
    </div>

    <p class="site-analytics__note">
      Մեկ մարդը մեկ օրում մեկ անգամ է հաշվվում, անկախ քանի անգամ է սեղմել/այցելել
      այդ օրում։ Վերևի մեծ թիվը («Տարբեր մարդ») ամբողջ ընտրված ժամանակահատվածում
      եզակի մարդկանց թիվն է. եթե նույն մարդը վերադառնում է մեկ այլ օր (նույնիսկ
      նույն ժամանակահատվածում), այդ թիվը ՉԻ փոխվում, քանի որ արդեն մեկ անգամ
      հաշվված է։ Այդ կրկնվող այցերն ու զանգերն ուրիշ տեղում են երևում.
      ստորին տողի առաջին թիվը՝ ընտրված ժամանակահատվածում օրերի գումարն է
      (նույն մարդը 3 տարբեր օր՝ 3, բայց դեռ 1 «տարբեր մարդ»), իսկ
      «Ընդհանուր»-ը՝ նույն հաշիվն ամբողջ պատմության վրա, առանց ժամանակահատվածի
      սահմանափակման. սա է թիվը, որ մեծանում է ամեն նոր օր, երբ նույն մարդն
      նորից գործողություն է կատարում, նույնիսկ եթե «Տարբեր մարդ»-ը տեղում է
      մնում։
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

    // Three cards now that "Ակտիվ զանգողներ" joined the two site-traffic
    // ones — two-per-row would leave the third alone on its own line.
    @media (min-width: 960px) {
      grid-template-columns: repeat(3, 1fr);
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

  // Deliberately louder than its sibling in the same row (larger, bold,
  // brand-coloured) — this is the number an admin needs to actually notice
  // moving day over day, since the card's headline "unique" figure stays flat
  // for a returning person by definition. See the template comment above.
  &__extra-highlight {
    dt {
      color: var(--color-text-secondary);
    }

    dd {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--color-primary);
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
