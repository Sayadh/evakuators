<script setup lang="ts">
import { isApiEnabled, nearestRepository } from '~/repositories'
import { SITE_NAME } from '~/constants/site'
import type { NearestSearchResult } from '~/types/nearest'
import { extractErrorMessage } from '~/utils/errors'
import { useGeolocation } from '~/composables/useGeolocation'

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
 */
useSeoMetaData({
  title: `Գտնել մոտակա էվակուատորը | ${SITE_NAME}`,
  description:
    'Թույլատրեք տեղադրության որոշումը և տեսեք Ձեզ ամենամոտ գտնվող էվակուատորները՝ հեռավորությամբ և մոտավոր հասնելու ժամանակով։',
  path: '/evakuator',
})

const { locating, error: geolocationError, locate } = useGeolocation()

const searching = ref(false)
const searchError = ref('')
/** Null until the first search completes — distinguishes "not asked yet" from "asked, found nothing" */
const result = ref<NearestSearchResult | null>(null)

const busy = computed(() => locating.value || searching.value)
const shownError = computed(() => geolocationError.value || searchError.value)

/** Asked at least once and got an empty list back — a different screen from the initial one */
const hasEmptyResult = computed(() => result.value !== null && result.value.results.length === 0)

async function findNearest(): Promise<void> {
  searchError.value = ''
  result.value = null

  // Mock mode has no backend to search, and the geolocation prompt would be a
  // real permission ask in exchange for nothing. Told plainly rather than
  // failing at the fetch — same master switch every service in this app checks
  // (see docs/architecture.md).
  if (!isApiEnabled()) {
    searchError.value =
      'Որոնումն այս պահին հասանելի չէ։ Օգտվեք ստորև՝ մարզերի և քաղաքների որոնումից։'
    return
  }

  const position = await locate()
  // `locate()` has already set a specific message; adding one here would show
  // two explanations for one refusal.
  if (!position) return

  searching.value = true
  try {
    result.value = await nearestRepository.findNearest(position.latitude, position.longitude)
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

    <p v-if="shownError" class="nearest-page__error" role="alert">{{ shownError }}</p>

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

    @media (min-width: 640px) {
      width: auto;
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
