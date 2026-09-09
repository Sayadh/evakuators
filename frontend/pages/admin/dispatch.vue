<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { adminRepository, isApiEnabled } from '~/repositories'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type { DispatchCandidate, DispatchFilter, DispatchTier } from '~/types/dispatch'
import {
  rememberDispatchPlace,
  searchDispatchPlaces,
  DISPATCH_RECENT_KEY,
  type DispatchPlace,
} from '~/utils/dispatchPlaces'
import { extractErrorMessage } from '~/utils/errors'
import { getPhoneHref } from '~/utils/formatPhone'

/**
 * The dispatcher's screen: somebody is on the phone saying where they are, and
 * this has to name a driver within about twenty seconds.
 *
 * That budget is the design. One input, no submit button, results the moment a
 * place is picked, and touch targets big enough for one thumb — this is used
 * standing up, on a phone, often at night, while talking. Everything that
 * would be reasonable on a desktop admin page (a table, filters that need
 * reading, a map) is either absent or one tap away by default.
 *
 * Admin only. The enforcement lives on the server — `AdminJwtGuard` sits on
 * every route of `/admin/dispatch`, so the candidate list and the referral
 * write are unreachable without an admin token no matter what the browser
 * does. What this page does is the same thing every other `/admin` page does:
 * it refuses to render its own contents to a visitor who is not signed in and
 * points them at the panel. That is deliberately NOT a route middleware —
 * there is no `admin-auth` middleware in this project, and inventing one for
 * one page would put a second, differently-behaving admin gate in the codebase
 * while adding no security the guard does not already provide.
 */
const adminAuth = useAdminAuthStore()
const apiEnabled = isApiEnabled()

const query = ref('')
const selected = ref<DispatchPlace | null>(null)
const recent = ref<DispatchPlace[]>([])
const filter = ref<DispatchFilter>('all')

const candidates = ref<DispatchCandidate[]>([])
const loading = ref(false)
const loadError = ref('')
const referringId = ref<number | null>(null)
/** Drivers already marked as taking the job in THIS search, so the row can say so */
const referredIds = ref<Set<number>>(new Set())

/**
 * Suggestions come from the site's own location index (`searchLocations`), so
 * the dispatcher can type Armenian, Latin or Russian, and villages, corridors
 * and «Երևան» itself all resolve — see `utils/dispatchPlaces.ts`. Synchronous:
 * static constants, no request to race a person who is typing while talking.
 */
const suggestions = computed(() =>
  selected.value === null ? searchDispatchPlaces(query.value) : [],
)

const FILTER_LABELS: Record<DispatchFilter, string> = {
  all: 'Բոլորը',
  'never-dispatched': 'Դեռ չեն ստացել',
  featured: 'Լավագույնները',
  'long-wait': 'Վաղուց չեն ստացել',
}

const TIER_LABELS: Record<DispatchTier, string> = {
  local: 'Հիմնականում այստեղ են',
  visiting: 'Գալիս են այլ տեղից',
  nationwide: 'Ամբողջ Հայաստան',
}

/**
 * Grouped by tier with visible headings, not merely sorted.
 *
 * While talking, the operator needs to see "two are local, five come from
 * elsewhere" in one glance. A sort order conveys that only to someone reading
 * every row, which is the thing there is no time for.
 */
const groups = computed(() =>
  (['local', 'visiting', 'nationwide'] as DispatchTier[])
    .map((tier) => ({ tier, items: candidates.value.filter((c) => c.tier === tier) }))
    .filter((group) => group.items.length > 0),
)

function readRecent(): DispatchPlace[] {
  try {
    const raw = localStorage.getItem(DISPATCH_RECENT_KEY)
    return raw ? (JSON.parse(raw) as DispatchPlace[]) : []
  } catch {
    // A private window, cleared site data, or a browser that refuses storage.
    // The chips are a convenience; the screen works without them.
    return []
  }
}

function writeRecent(next: DispatchPlace[]): void {
  try {
    localStorage.setItem(DISPATCH_RECENT_KEY, JSON.stringify(next))
  } catch {
    // Same as above — never let a storage failure interrupt a dispatch.
  }
}

onMounted(() => {
  recent.value = readRecent()
})

async function load(): Promise<void> {
  const place = selected.value
  if (!place || !adminAuth.isLoggedIn) return

  loading.value = true
  loadError.value = ''
  try {
    const answer = await adminRepository.listDispatchCandidates(place, filter.value)
    candidates.value = answer.items
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Վարորդներին բեռնել չհաջողվեց։')
    candidates.value = []
  } finally {
    loading.value = false
  }
}

function pick(place: DispatchPlace): void {
  selected.value = place
  query.value = place.name
  referredIds.value = new Set()
  recent.value = rememberDispatchPlace(recent.value, place)
  writeRecent(recent.value)
  void load()
}

/** Typing again abandons the current answer — the caller has corrected themselves */
function onInput(): void {
  if (selected.value !== null) {
    selected.value = null
    candidates.value = []
    referredIds.value = new Set()
  }
}

function reset(): void {
  query.value = ''
  selected.value = null
  candidates.value = []
  loadError.value = ''
  referredIds.value = new Set()
}

watch(filter, () => {
  if (selected.value) void load()
})

/**
 * Records that this driver took the job.
 *
 * Pressed AFTER they agreed on the phone, never as part of «Զանգել» — the
 * count this feeds has to mean work offered rather than numbers dialled, and
 * the operator often rings two or three before one answers.
 *
 * The row is marked rather than removed: the operator may need to ring back,
 * and a row that vanishes under a thumb is worse than one that changes colour.
 *
 * ## Why it asks first
 *
 * Because it is the one irreversible thing on this screen. A referral is a
 * permanent row, it moves the driver's «այս ամիս» count, and that count is the
 * answer given when a driver asks what the subscription bought them. There is
 * no undo, and the button sits a thumb's width from «Զանգել» on a phone held
 * one-handed while talking — the two ways to get it wrong are a mis-tap and
 * pressing it on the driver who was rung but did not take the job.
 *
 * The dialog names the driver and the place, so the confirmation answers the
 * question that was actually at stake ("this driver, this job") rather than
 * asking "are you sure" about something the operator can no longer see.
 */
const confirmTarget = ref<DispatchCandidate | null>(null)
/**
 * Its own error, not `loadError`: that one belongs to the list behind the
 * dialog, and showing a stale "could not load" inside a confirmation the
 * operator just opened would read as this action having failed.
 */
const referError = ref('')

function askReferred(candidate: DispatchCandidate): void {
  if (referringId.value !== null || referredIds.value.has(candidate.id)) return
  referError.value = ''
  confirmTarget.value = candidate
}

async function markReferred(candidate: DispatchCandidate): Promise<void> {
  const place = selected.value
  if (!place || referringId.value !== null) return

  referringId.value = candidate.id
  referError.value = ''
  try {
    await adminRepository.recordDispatchReferral({
      towTruckId: candidate.id,
      locationSlug: place.slug,
      locationName: place.name,
      locationType: place.type,
    })
    referredIds.value = new Set([...referredIds.value, candidate.id])
    confirmTarget.value = null
  } catch (error) {
    // The dialog stays open on failure — closing it would leave the operator
    // looking at an unchanged row with an error message somewhere above it,
    // unsure whether to press again.
    referError.value = extractErrorMessage(error, 'Գրանցել չհաջողվեց։')
  } finally {
    referringId.value = null
  }
}

function lastDispatchedLabel(candidate: DispatchCandidate): string {
  if (!candidate.lastDispatchedAt) return 'դեռ չի ստացել'
  const days = Math.floor((Date.now() - new Date(candidate.lastDispatchedAt).getTime()) / 86_400_000)
  if (days <= 0) return 'վերջինը՝ այսօր'
  if (days === 1) return 'վերջինը՝ երեկ'
  return `վերջինը՝ ${days} օր առաջ`
}

useSeoMetaData({
  title: 'Ուղղորդում',
  description: 'Դիսպետչերի էկրան',
  path: '/admin/dispatch',
  noindex: true,
})
</script>

<template>
  <div class="container dispatch">
    <header class="dispatch__header">
      <h1 class="dispatch__title">Ուղղորդում</h1>
      <NuxtLink to="/admin" class="dispatch__back">Ադմին վահանակ</NuxtLink>
    </header>

    <EmptyState
      v-if="!apiEnabled"
      title="Backend API-ն միացված չէ"
      description="NUXT_PUBLIC_API_BASE_URL փոփոխականը դատարկ է, ուստի կայքն աշխատում է mock տվյալներով։"
      icon="info"
    />

    <EmptyState
      v-else-if="!adminAuth.isLoggedIn"
      title="Մուտք գործեք"
      description="Այս էջը հասանելի է միայն ադմինիստրատորին։ Բացեք ադմին վահանակը և մուտք գործեք։"
      icon="info"
    />

    <template v-else>
      <!-- One field, always focused on arrival. There is no submit button on
           purpose: picking a place IS the search, and the extra tap is real in a
           twenty-second budget. -->
      <div class="dispatch__search">
        <AppInput
          v-model="query"
          label="Որտեղ է հաճախորդը"
          placeholder="Աբովյան, Արաբկիր…"
          autocomplete="off"
          @update:model-value="onInput"
        />

        <ul v-if="suggestions.length" class="dispatch__suggestions">
          <li v-for="place in suggestions" :key="`${place.type}-${place.slug}`">
            <button type="button" class="dispatch__suggestion" @click="pick(place)">
              <span class="dispatch__suggestion-name">{{ place.name }}</span>
              <span v-if="place.context" class="dispatch__muted">{{ place.context }}</span>
            </button>
          </li>
        </ul>

        <!-- Yerevan districts repeat all night; one tap beats six letters. -->
        <div v-if="recent.length && !selected" class="dispatch__recent">
          <span class="dispatch__muted">Վերջինները՝</span>
          <button
            v-for="place in recent"
            :key="`recent-${place.type}-${place.slug}`"
            type="button"
            class="dispatch__chip"
            @click="pick(place)"
          >
            {{ place.name }}
          </button>
        </div>
      </div>

      <template v-if="selected">
        <div class="dispatch__toolbar">
          <strong>{{ selected.name }}</strong>
          <select v-model="filter" class="dispatch__filter" aria-label="Ֆիլտր">
            <option v-for="(label, value) in FILTER_LABELS" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
          <button type="button" class="dispatch__back" @click="reset">Մաքրել</button>
        </div>

        <p v-if="referError" class="dispatch__error" role="alert">{{ referError }}</p>
        <p v-if="loading" class="dispatch__muted">Բեռնվում է…</p>

        <p v-else-if="candidates.length === 0" class="dispatch__empty">
          Այս տարածքի համար վարորդ չի գտնվել։
          <template v-if="filter !== 'all'">Փորձեք «Բոլորը» ֆիլտրով։</template>
        </p>

        <section v-for="group in groups" :key="group.tier" class="dispatch__group">
          <h2 class="dispatch__group-title">
            {{ TIER_LABELS[group.tier] }} · {{ group.items.length }}
          </h2>

          <article
            v-for="candidate in group.items"
            :key="candidate.id"
            class="dispatch__card"
            :class="{ 'dispatch__card--referred': referredIds.has(candidate.id) }"
          >
            <div class="dispatch__who">
              <span class="dispatch__name">
                {{ candidate.driverName }}
                <span v-if="candidate.isFeatured" title="Լավագույններից">★</span>
              </span>
              <span class="dispatch__muted">{{ candidate.vehicle }}</span>
            </div>

            <p class="dispatch__meta">
              <span v-if="candidate.rating">⭐ {{ candidate.rating }}</span>
              <span>{{ candidate.dispatchesThisMonth }} այս ամիս</span>
              <span>{{ lastDispatchedLabel(candidate) }}</span>
            </p>

            <p class="dispatch__meta dispatch__muted">
              <span v-if="group.tier !== 'local'">բազան՝ {{ candidate.baseName }}</span>
              <span v-if="candidate.subscriptionStatus === 'overdue'" class="dispatch__warn">
                բաժանորդագրությունը սպառվել է
              </span>
            </p>

            <div class="dispatch__actions">
              <a :href="getPhoneHref(candidate.phone)" class="dispatch__call">
                Զանգել · {{ candidate.phone }}
              </a>
              <AppButton
                size="sm"
                :variant="referredIds.has(candidate.id) ? 'success' : 'outline'"
                :disabled="referringId === candidate.id || referredIds.has(candidate.id)"
                @click="askReferred(candidate)"
              >
                {{ referredIds.has(candidate.id) ? 'Ուղղորդված է ✓' : 'Ուղղորդված է' }}
              </AppButton>
            </div>
          </article>
        </section>
      </template>
    </template>

    <!-- The only irreversible action here, so it is the only one that asks.
         Named, not "are you sure": the operator has just been reading a list of
         near-identical rows on a phone. -->
    <AppModal
      :model-value="confirmTarget !== null"
      title="Հաստատել ուղղորդումը"
      @update:model-value="confirmTarget = null"
    >
      <div v-if="confirmTarget" class="dispatch__confirm">
        <p>
          <strong>{{ confirmTarget.driverName }}</strong> — {{ confirmTarget.phone }}
        </p>
        <p class="dispatch__muted">
          Հաստատում եք, որ այս վարորդը վերցրե՞լ է պատվերը՝ {{ selected?.name }}։
          Գրառումը կավելանա իր ամսվա հաշվին և հետ չի վերցվում։
        </p>
        <p v-if="loadError" class="dispatch__error" role="alert">{{ loadError }}</p>
        <AppButton
          variant="success"
          block
          :disabled="referringId === confirmTarget.id"
          @click="markReferred(confirmTarget)"
        >
          {{ referringId === confirmTarget.id ? 'Պահպանվում է…' : 'Այո, վերցրել է' }}
        </AppButton>
      </div>
    </AppModal>
  </div>
</template>

<style scoped lang="scss">
.dispatch {
  padding-top: var(--space-5);
  padding-bottom: var(--space-8);
  max-width: 640px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  &__title {
    margin: 0;
    font-size: 1.4rem;
  }

  &__back {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    background: none;
    border: 0;
    cursor: pointer;
  }

  &__search {
    position: relative;
  }

  &__suggestions {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-surface);
  }

  &__suggestion {
    width: 100%;
    /* Deliberately tall: this is pressed with a thumb, standing up, at night. */
    padding: var(--space-3) var(--space-4);
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--color-border);
    cursor: pointer;
    text-align: left;
    font-size: 1rem;

    &:last-child {
      border-bottom: 0;
    }
  }

  &__suggestion-name {
    font-weight: 600;
  }

  &__recent {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  &__chip {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    cursor: pointer;
    font-size: 0.9rem;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: var(--space-5) 0 var(--space-3);
  }

  &__filter {
    margin-left: auto;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: 0.9rem;
  }

  &__group {
    margin-bottom: var(--space-5);
  }

  &__group-title {
    margin: 0 0 var(--space-2);
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-secondary);
  }

  &__card {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    margin-bottom: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    &--referred {
      border-color: var(--color-success, #2f855a);
      background: rgba(47, 133, 90, 0.06);
    }
  }

  &__who {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__name {
    font-weight: 600;
    font-size: 1.05rem;
  }

  &__meta {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: 0.9rem;
  }

  &__muted {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  &__warn {
    color: var(--color-danger, #c53030);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  /* The primary action on the screen, sized like it. */
  &__call {
    flex: 1;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: #fff;
    text-align: center;
    font-weight: 600;
    text-decoration: none;
  }

  &__error {
    color: var(--color-danger, #c53030);
    margin: 0 0 var(--space-3);
  }

  &__confirm {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);

    p {
      margin: 0;
    }
  }

  &__empty {
    color: var(--color-text-secondary);
  }
}
</style>
