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
 * ## Three things can happen when the button is pressed
 *
 * In this order, and the order is the point — the cheapest outcome is checked
 * first, so a visitor inside the hour never sees a permission prompt at all:
 *
 * 1. **A fresh remembered answer exists** → show it. No prompt, no request.
 * 2. **Today's allowance is used up** → say so, and keep showing the old list
 *    if there is one. A stale list of the drivers nearest a place someone
 *    stood an hour ago is far more use to them than an empty screen.
 * 3. **Otherwise** → ask for the position and search, then remember both the
 *    answer and the fact that an allowance was spent.
 */

useSeoMetaData({
  title: `Գտնել մոտակա էվակուատորը | ${SITE_NAME}`,
  description:
    'Թույլատրեք տեղադրության որոշումը և տեսեք Ձեզ ամենամոտ գտնվող էվակուատորները՝ հեռավորությամբ և մոտավոր հասնելու ժամանակով։',
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
/** Set when a press was refused because today's allowance is gone */
const showingLimitNotice = ref(false)

// `localStorage` does not exist on the server, so both remembered values are
// read after mount rather than during setup. Reading them while rendering
// would make the server and the browser disagree about what is on screen,
// which is the hydration bug docs/architecture.md warns about — and here it
// would be over a list of drivers, not a stray class name.
onMounted(restore)

const busy = computed(() => locating.value || searching.value)
const shownError = computed(() => geolocationError.value || searchError.value)

/** Asked at least once and got an empty list back — a different screen from the initial one */
const hasEmptyResult = computed(() => result.value !== null && result.value.results.length === 0)

/** "14:32" — when the list on screen was actually computed */
const cachedAtLabel = computed(() => (cachedAt.value ? formatClockTime(cachedAt.value) : ''))

async function findNearest(): Promise<void> {
  searchError.value = ''
  servedFromCache.value = false
  showingLimitNotice.value = false
  result.value = null

  // Checked before locate(), not after: while the feature is off a visitor must
  // never see a permission prompt at all — a browser that is refused once
  // remembers it, so prompting for something we then cannot deliver spends a
  // permission we will want later.
  if (!NEAREST_SEARCH_ENABLED) {
    searchError.value = 'Այս պահին աշխատում ենք այս գործառույթի վրա։ Այն շուտով հասանելի կլինի։'
    return
  }

  // Mock mode has no backend to search, and the geolocation prompt would be a
  // real permission ask in exchange for nothing. Told plainly rather than
  // failing at the fetch — same master switch every service in this app checks
  // (see docs/architecture.md).
  if (!isApiEnabled()) {
    searchError.value =
      'Որոնումն այս պահին հասանելի չէ։ Օգտվեք ստորև՝ մարզերի և քաղաքների որոնումից։'
    return
  }

  // Before the permission prompt AND before the allowance check: the answer is
  // already here, so asking the browser for a position would be spending a
  // prompt to recompute something we can show instantly.
  if (isCacheFresh.value && cachedResult.value) {
    result.value = cachedResult.value
    servedFromCache.value = true
    return
  }

  // Nothing fresh left to show and nothing left to spend. The old list stays
  // on screen underneath (see the template) — an hour-old list of nearby
  // drivers still answers "who do I call", which an empty page does not.
  if (limitReached.value) {
    showingLimitNotice.value = true
    result.value = cachedResult.value
    servedFromCache.value = cachedResult.value !== null
    return
  }

  const position = await locate()
  // `locate()` has already set a specific message; adding one here would show
  // two explanations for one refusal.
  if (!position) return

  searching.value = true
  try {
    const fresh = await nearestRepository.findNearest(position.latitude, position.longitude)
    result.value = fresh
    // Charged only on a delivered answer — a refused prompt or a failed
    // request above never reaches this line, so neither costs an allowance.
    remember(fresh)
  } catch (error) {
    searchError.value = extractErrorMessage(
      error,
      'Չհաջողվեց գտնել մոտակա էվակուատորները։ Ստուգեք կապը և փորձեք կրկին։',
    )
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <div class="container nearest-page">
    <AppBreadcrumbs :items="[{ label: 'Մոտակա էվակուատորներ' }]" />

    <h1>Գտնել մոտակա էվակուատորները</h1>
    <p class="nearest-page__intro">
      Սեղմեք կոճակը և թույլատրեք տեղադրության որոշումը։ Մենք կցուցադրենք Ձեզ ամենամոտ գտնվող
      ակտիվ էվակուատորները՝ հեռավորությամբ և մոտավոր հասնելու ժամանակով։ Ձեր տեղադրությունը չի
      պահպանվում։
    </p>

    <AppButton
      variant="accent"
      size="lg"
      :disabled="busy"
      class="nearest-page__locate"
      @click="findNearest"
    >
      <AppIcon name="map-pin" :size="20" />
      {{ locating ? 'Որոշվում է տեղադրությունը…' : searching ? 'Որոնվում է…' : 'Որոշել իմ տեղադրությունը' }}
    </AppButton>

    <!-- Gated on `restored` so the figure is never rendered before storage has
         been read — see the composable. Hidden once the allowance is gone,
         because the notice below then says the same thing with more detail. -->
    <p
      v-if="NEAREST_SEARCH_ENABLED && restored && !limitReached"
      class="nearest-page__allowance"
    >
      Այսօր մնացել է {{ searchesLeftToday }} որոնում {{ NEAREST_DAILY_SEARCH_LIMIT }}-ից։
      Կրկնակի սեղմումը մեկ ժամվա ընթացքում նոր որոնում չի ծախսում։
    </p>

    <p v-if="shownError" class="nearest-page__error" role="alert">{{ shownError }}</p>

    <!-- Not styled as an error: nothing went wrong, the allowance is simply
         spent. It says when it resets, and the list below stays on screen. -->
    <p v-if="showingLimitNotice" class="nearest-page__notice" role="status">
      <AppIcon name="info" :size="16" />
      <span>
        Օրական {{ NEAREST_DAILY_SEARCH_LIMIT }} որոնման սահմանաչափը սպառվել է։ Խնդրում ենք
        փորձել վաղը։
        <template v-if="cachedResult">
          Ստորև ցուցադրված է Ձեր վերջին որոնման արդյունքը՝ {{ cachedAtLabel }}-ի դրությամբ։
        </template>
        <template v-else>
          Այդ ընթացքում կարող եք գտնել վարորդ ըստ մարզի կամ քաղաքի։
        </template>
      </span>
    </p>

    <div v-if="busy" class="nearest-page__results">
      <LoadingSkeleton variant="card" :count="3" />
    </div>

    <!-- Asked, and there is genuinely nobody within range. Distinct from an
         error: nothing went wrong, the answer is just empty — so the copy says
         so and immediately offers the search that does have answers. -->
    <EmptyState
      v-else-if="hasEmptyResult"
      title="Ձեր մոտակայքում էվակուատոր չի գտնվել"
      description="Հնարավոր է՝ այս տարածքում դեռ գրանցված վարորդ չկա, կամ նրանք դեռ չեն նշել իրենց տեղադիրքը։ Փորձեք գտնել վարորդ ըստ մարզի կամ քաղաքի։"
      icon="truck"
    />

    <template v-else-if="result">
      <div class="nearest-page__summary">
        <h2 class="nearest-page__results-title">Ձեզ ամենամոտ էվակուատորները</h2>
        <!-- Shown only for a remembered list. A visitor looking at drivers
             "near me" is entitled to know the answer was computed a while ago
             and from where they stood then — without it, an hour-old list is
             indistinguishable from a live one. -->
        <p v-if="servedFromCache && cachedAtLabel" class="nearest-page__disclaimer">
          <AppIcon name="clock" :size="16" />
          <span>
            Ցուցակը կազմվել է {{ cachedAtLabel }}-ին՝ այն պահի Ձեր տեղադրության հիման վրա։
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
            Հեռավորությունը հաշվարկված է վարորդի նշած հիմնական կայանման վայրից, ոչ թե իրական
            ժամանակի GPS դիրքից։ Ճշգրիտ ժամանակը ճշտեք վարորդի հետ զանգով։
          </span>
        </p>
        <!-- Shown only in fallback mode, where it explains why there are no
             times at all — otherwise it would be an apology for a page that is
             working correctly. -->
        <p v-if="!result.routed" class="nearest-page__disclaimer">
          <AppIcon name="alert" :size="16" />
          <span>
            Ճանապարհային հեռավորության ծառայությունն այս պահին հասանելի չէ, ուստի ցուցադրվում է
            ուղիղ գծով հեռավորությունը։ Իրական ճանապարհը սովորաբար ավելի երկար է։
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

    <!-- Always present, in every state: it is the fallback the error copy keeps
         pointing at, and a visitor who has just been refused a permission
         should not have to go looking for it. -->
    <section class="nearest-page__fallback">
      <h2>Կամ գտեք ըստ մարզի և քաղաքի</h2>
      <p>
        Եթե տեղադրության որոշումը հասանելի չէ, ընտրեք Ձեր մարզը կամ քաղաքը՝ տեսնելու այնտեղ
        աշխատող բոլոր էվակուատորները։
      </p>
      <div class="nearest-page__fallback-actions">
        <AppButton to="/regions" variant="outline">Մարզեր</AppButton>
        <AppButton to="/yerevan" variant="outline">Երևան</AppButton>
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

  // Same shape as the error box, neutral colours — a spent allowance is a
  // rule working as intended, not a failure, and colouring it red would send
  // someone looking for a problem to fix.
  &__notice {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    line-height: 1.55;

    svg {
      flex-shrink: 0;
      margin-top: 2px;
      color: var(--color-text-muted);
    }
  }

  &__summary {
    margin-top: var(--space-6);
  }

  &__results-title {
    margin: 0 0 var(--space-3);
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
