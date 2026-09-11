<script setup lang="ts">
import { isApiEnabled, nearestRepository } from '~/repositories'
import { NEAREST_SEARCH_ENABLED } from '~/constants/features'
import { NEAREST_DAILY_SEARCH_LIMIT } from '~/constants/nearest'
import { SITE_NAME } from '~/constants/site'
import type { NearestSearchResult } from '~/types/nearest'
import { extractErrorMessage } from '~/utils/errors'
import { formatClockTime } from '~/utils/formatters'
import { useGeolocation } from '~/composables/useGeolocation'
import { useNearestSearch } from '~/composables/useNearestSearch'

/**
 * «Գտնել մոտակա էվակուատորները» — the one page on the site that asks for the
 * visitor's position.
 *
 * ## Nothing happens until they press the button
 *
 * No geolocation on mount, no `useAsyncData`, no SSR fetch. A permission prompt
 * that appears because a page loaded is a prompt the visitor did not ask for,
 * and the browsers that do not block it outright will remember the refusal. So
 * the page renders an explanation and a button, and the ask comes after a
 * deliberate press.
 *
 * ## The coordinates never leave this call stack
 *
 * They go from the browser into one POST body and are never written anywhere —
 * not to a store, not to the URL, not to `localStorage`, and not to the
 * database. The backend keeps them only as a five-minute cache key rounded to
 * ~110 m. See `docs/nearest-search.md`.
 *
 * That still holds now that the last answer is remembered for an hour: what is
 * written to `localStorage` is the **result list and a timestamp**, never the
 * position it was computed from. See `useNearestSearch`.
 *
 * ## What happens when the button is pressed
 *
 * In this order, and the order is the point — the cheapest outcome is checked
 * first, so a visitor inside the hour never sees a permission prompt at all:
 *
 * 1. **A fresh remembered answer exists** → show it. No prompt, no request.
 * 2. **Otherwise** → ask for the position and search.
 *
 * ## The daily allowance takes away road data, not the search
 *
 * `NEAREST_DAILY_SEARCH_LIMIT` (2/day) buys **detailed** answers — the ones
 * carrying road distances and driving times, which cost the platform a call
 * against a metered external quota. Once it is spent the page goes on
 * searching, unlimited, with `skipRouting`: the visitor still gets the
 * drivers nearest them, ranked and complete, measured «Ուղիղ գծով». Only the
 * road figures wait until tomorrow.
 *
 * That is why there is no "come back tomorrow" dead end here. Someone
 * standing next to a broken car who has already looked twice today is the
 * last person who should be handed an empty screen, and the half of the answer
 * that costs nothing to produce is the half that tells them who to call.
 */

const { t } = useI18n()

useSeoMetaData({
  title: `${t('nearest.metaTitle')} | ${SITE_NAME}`,
  description: t('nearest.intro'),
  path: '/evakuator',
})

const { locating, error: geolocationError, locate } = useGeolocation()
const {
  restore,
  restored,
  remember,
  cachedResult,
  cachedAt,
  isCacheFresh,
  searchesLeftToday,
  limitReached,
} = useNearestSearch()

const searching = ref(false)
const searchError = ref('')
/** Null until the first search completes — distinguishes "not asked yet" from "asked, found nothing" */
const result = ref<NearestSearchResult | null>(null)
/** Set when a press was answered from storage rather than the network */
const servedFromCache = ref(false)
/**
 * Set when the list on screen has no road figures *because the allowance is
 * spent*, rather than because the routing service is down. The two look
 * identical in the response (`routed: false`) and need opposite copy: one is
 * a rule working as designed and resets at midnight, the other is an outage.
 */
const degradedByAllowance = ref(false)

// `localStorage` does not exist on the server, so both remembered values are
// read after mount rather than during setup. Reading them while rendering
// would make the server and the browser disagree about what is on screen,
// which is the hydration bug docs/architecture.md warns about — and here it
// would be over a list of drivers, not a stray class name.
onMounted(restore)

const busy = computed(() => locating.value || searching.value)
const shownError = computed(() => geolocationError.value || searchError.value)

/**
 * Wraps whichever of the three post-press states (empty result, result list,
 * or nothing yet) is actually mounted, so there is one stable element to
 * scroll to regardless of which branch rendered — a ref placed on the result
 * list alone would be null on an empty answer, and the empty state deserves
 * the same "the answer is here" scroll as a full list does.
 */
const resultsAnchor = ref<HTMLElement | null>(null)

// Fires once the button's press actually resolves into something to look at
// — not on `busy`, so a visitor is not yanked down the page before there is
// anything there yet. `nextTick` waits for the v-if branch to have rendered,
// since scrolling to the anchor the same tick it appears would measure the
// page before the new content exists in it.
watch(result, (value) => {
  if (value === null) return
  nextTick(() => {
    resultsAnchor.value?.scrollIntoView({ block: 'start' })
  })
})

/** Asked at least once and got an empty list back — a different screen from the initial one */
const hasEmptyResult = computed(() => result.value !== null && result.value.results.length === 0)

/** "14:32" — when the list on screen was actually computed */
const cachedAtLabel = computed(() => (cachedAt.value ? formatClockTime(cachedAt.value) : ''))

async function findNearest(): Promise<void> {
  searchError.value = ''
  servedFromCache.value = false
  degradedByAllowance.value = false
  result.value = null

  // Checked before locate(), not after: while the feature is off a visitor must
  // never see a permission prompt at all — a browser that is refused once
  // remembers it, so prompting for something we then cannot deliver spends a
  // permission we will want later.
  if (!NEAREST_SEARCH_ENABLED) {
    searchError.value = t('nearest.featureDisabledError')
    return
  }

  // Mock mode has no backend to search, and the geolocation prompt would be a
  // real permission ask in exchange for nothing. Told plainly rather than
  // failing at the fetch — same master switch every service in this app checks
  // (see docs/architecture.md).
  if (!isApiEnabled()) {
    searchError.value = t('nearest.apiDisabledError')
    return
  }

  // Before the permission prompt: the answer is already here, so asking the
  // browser for a position would be spending a prompt to recompute something
  // we can show instantly.
  if (isCacheFresh.value && cachedResult.value) {
    result.value = cachedResult.value
    servedFromCache.value = true
    return
  }

  // Out of detailed searches is not out of searches. The request still goes,
  // it just asks for the half that costs nothing — so this is read here, in
  // front of the call, rather than being a reason not to make it.
  const straightLineOnly = limitReached.value

  const position = await locate()
  // `locate()` has already set a specific message; adding one here would show
  // two explanations for one refusal.
  if (!position) return

  searching.value = true
  try {
    const fresh = await nearestRepository.findNearest(
      position.latitude,
      position.longitude,
      straightLineOnly,
    )
    result.value = fresh
    degradedByAllowance.value = straightLineOnly
    // Charged only for a delivered answer that actually bought road data — a
    // refused prompt or a failed request above never reaches this line, and a
    // straight-line answer has nothing left to charge.
    remember(fresh, !straightLineOnly)
  } catch (error) {
    searchError.value = extractErrorMessage(error, t('nearest.searchFailedError'))
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <div class="container nearest-page">
    <AppBreadcrumbs :items="[{ label: t('nearest.breadcrumb') }]" />

    <h1>{{ t('nearest.cta') }}</h1>
    <p class="nearest-page__intro">
      {{ t('nearest.intro') }}
    </p>

    <AppButton
      variant="accent"
      size="lg"
      :disabled="busy"
      class="nearest-page__locate"
      @click="findNearest"
    >
      <AppIcon name="map-pin" :size="20" />
      {{ locating ? t('nearest.locating') : searching ? t('nearest.searching') : t('nearest.locateButton') }}
    </AppButton>

    <!-- Gated on `restored` so the figure is never rendered before storage has
         been read — see the composable. Both branches are deliberately about
         road data rather than about searching: the search itself never runs
         out, and copy implying it does would send someone away from a page
         that still works. -->
    <p v-if="NEAREST_SEARCH_ENABLED && restored" class="nearest-page__allowance">
      <template v-if="limitReached">
        {{ t('nearest.allowanceLimitReached', { limit: NEAREST_DAILY_SEARCH_LIMIT }) }}
      </template>
      <template v-else>
        {{ t('nearest.allowanceRemaining', { left: searchesLeftToday, limit: NEAREST_DAILY_SEARCH_LIMIT }) }}
      </template>
    </p>

    <p v-if="shownError" class="nearest-page__error" role="alert">{{ shownError }}</p>

    <!--
      One wrapper around all three post-press states, so there is a single
      stable element to scroll to no matter which branch rendered — a ref on
      the result list alone would be null on an empty answer, and the empty
      state deserves the same "the answer is here" scroll as a full list
      does. Not on the skeleton's own scroll: the watcher only fires once
      `result` actually resolves (see the script), so a visitor is not
      yanked down the page before there is anything there yet.
    -->
    <div ref="resultsAnchor" class="nearest-page__results-anchor">
      <div v-if="busy" class="nearest-page__results">
        <LoadingSkeleton variant="card" :count="3" />
      </div>

      <!-- Asked, and there is genuinely nobody within range. Distinct from an
           error: nothing went wrong, the answer is just empty — so the copy says
           so and immediately offers the search that does have answers. -->
      <EmptyState
        v-else-if="hasEmptyResult"
        :title="t('nearest.emptyTitle')"
        :description="t('nearest.emptyDescription')"
        icon="truck"
      />

      <template v-else-if="result">
        <div class="nearest-page__summary">
          <h2 class="nearest-page__results-title">{{ t('nearest.resultsTitle') }}</h2>
          <!-- Shown only for a remembered list. A visitor looking at drivers
               "near me" is entitled to know the answer was computed a while ago
               and from where they stood then — without it, an hour-old list is
               indistinguishable from a live one. -->
          <p v-if="servedFromCache && cachedAtLabel" class="nearest-page__disclaimer">
            <AppIcon name="clock" :size="16" />
            <span>
              {{ t('nearest.cachedAtDisclaimer', { time: cachedAtLabel }) }}
            </span>
          </p>
          <!-- The honesty line, and the reason it is not fine print: every number
               on this page is measured from the parking spot a driver typed into
               their profile, not from where their truck is right now. A visitor
               who assumes otherwise will plan around a figure that was never
               promised. -->
          <p class="nearest-page__disclaimer">
            <AppIcon name="info" :size="16" />
            <span>
              {{ t('nearest.distanceDisclaimer') }}
            </span>
          </p>
          <!-- Both branches explain the same missing numbers, and the reason is
               what differs. Telling someone the routing service is down when it
               is simply their third search of the day would be a false outage
               report; telling someone their allowance is spent when the service
               is actually down would be a lie they cannot act on. -->
          <p v-if="!result.routed" class="nearest-page__disclaimer">
            <AppIcon v-if="degradedByAllowance" name="info" :size="16" />
            <AppIcon v-else name="alert" :size="16" />
            <span v-if="degradedByAllowance">
              {{ t('nearest.degradedByAllowanceText') }}
            </span>
            <span v-else>
              {{ t('nearest.routingDownText') }}
            </span>
          </p>
        </div>

        <div class="nearest-page__results">
          <NearestResultCard
            v-for="item in result.results"
            :key="item.towTruck.id"
            :result="item"
            :routed="result.routed"
          />
        </div>
      </template>
    </div>

    <!-- Always present, in every state: it is the fallback the error copy keeps
         pointing at, and a visitor who has just been refused a permission
         should not have to go looking for it. -->
    <section class="nearest-page__fallback">
      <h2>{{ t('nearest.fallbackTitle') }}</h2>
      <p>
        {{ t('nearest.fallbackText') }}
      </p>
      <div class="nearest-page__fallback-actions">
        <AppButton to="/regions" variant="outline">{{ t('nearest.regionsButton') }}</AppButton>
        <AppButton to="/yerevan" variant="outline">{{ t('nearest.yerevanButton') }}</AppButton>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.nearest-page {
  padding-top: var(--space-5);
  padding-bottom: var(--space-8);
  max-width: 860px;

  &__intro {
    color: var(--color-text-secondary);
    max-width: 640px;
    margin-bottom: var(--space-5);
  }

  &__locate {
    // Full width on a phone — this is the only action on the screen at that
    // point, and it is being pressed by someone standing next to a broken car.
    width: 100%;

    // Same override, same reason as NearestTowTrucksCta: AppButton is
    // `white-space: nowrap`, and «Որոշվում է տեղադրությունը…» is long enough to
    // overflow a 320px screen. Scoped here so no other button changes.
    white-space: normal;
    line-height: 1.35;
    text-align: center;

    @media (min-width: 640px) {
      width: auto;
      white-space: nowrap;
    }
  }

  &__error {
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    border: 1px solid var(--color-danger);
    color: var(--color-danger);
    line-height: 1.55;
  }

  &__allowance {
    margin-top: var(--space-3);
    margin-bottom: 0;
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--color-text-muted);
  }

  &__summary {
    margin-top: var(--space-6);
  }

  &__results-title {
    margin: 0 0 var(--space-3);
  }

  // The scroll target itself (see the script's `resultsAnchor`). The offset
  // keeps the sticky header from covering the top of whatever just appeared
  // — without it, `scrollIntoView` would land the anchor exactly under the
  // header rather than just below it.
  &__results-anchor {
    scroll-margin-top: calc(var(--header-height) + var(--space-3));
  }

  &__disclaimer {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: 0 0 var(--space-3);
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--color-text-secondary);

    svg {
      flex-shrink: 0;
      margin-top: 2px;
      color: var(--color-text-muted);
    }
  }

  &__results {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }

  &__fallback {
    margin-top: var(--space-7);
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border);

    h2 {
      margin: 0 0 var(--space-2);
      font-size: 1.15rem;
    }

    p {
      margin: 0 0 var(--space-4);
      color: var(--color-text-secondary);
    }
  }

  &__fallback-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
}
</style>
