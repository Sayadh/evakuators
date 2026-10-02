<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { adminRepository, isApiEnabled, type AdminTowTruck } from '~/repositories'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type {
  DispatchCandidate,
  DispatchCandidateByDistance,
  DispatchFilter,
  DispatchTier,
} from '~/types/dispatch'
import { capacityDisplayText } from '~/constants/vehicles'
import { formatCoordinates, parseCoordinates } from '~/utils/coordinates'
import {
  rememberDispatchPlace,
  searchDispatchPlaces,
  DISPATCH_RECENT_KEY,
  type DispatchPlace,
} from '~/utils/dispatchPlaces'
import { extractErrorMessage } from '~/utils/errors'
import { formatDistanceLine } from '~/utils/formatDistance'
import { getPhoneHref } from '~/utils/formatPhone'
import { getTowTruckRoute } from '~/utils/routeHelpers'

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

/**
 * Two ways to ask the same question. Place search stays the default — it is
 * what the operator uses for almost every call, a named location the customer
 * just said out loud. Coordinate search is for the other case: a customer who
 * can drop a pin (or read one off Google Maps) but cannot name where they are.
 *
 * The two searches, their results and their own loading/error state are kept
 * entirely separate rather than folded into one set of refs — they are
 * different questions with different result shapes (a coordinate has no
 * `DispatchPlace` to derive a `tier` from, see `DispatchCandidateByDistance`),
 * and switching the toggle does not throw away whichever search is not
 * currently shown, so flipping back and forth costs nothing.
 */
type SearchMode = 'place' | 'coordinates' | 'driver'
const mode = ref<SearchMode>('place')

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

/**
 * Coordinate search — a separate pipeline from the place one above.
 *
 * `CoordinatesInput` carries a single pasted string (see that component), so
 * this parses it with the same `parseCoordinates` the registration form and
 * both admin coordinate dialogs already use — a value this screen rejects is
 * one every other screen rejects too, and the messages the dispatcher sees are
 * the ones drivers already know.
 *
 * «Ուղղորդված է» works here too, same as the place-based list: the referral
 * still needs a `locationSlug`/`locationName`/`locationType` to store, but a
 * raw coordinate does not have to pretend to be a city or a district to get
 * one — `locationType: 'coordinates'` (see `DispatchReferralLocationType` on
 * the backend) says exactly what it is, and `locationName` is the same pair
 * `formatCoordinates` already prints above the list. See `confirmLocation`
 * below for where that gets built.
 */
const coordinatesText = ref('')
const coordinatesError = ref('')
const lastCoordinates = ref<{ latitude: number; longitude: number } | null>(null)
const distanceCandidates = ref<DispatchCandidateByDistance[]>([])
const distanceLoading = ref(false)
const distanceLoadError = ref('')

function setMode(next: SearchMode): void {
  mode.value = next
}

/** Typing again clears the previous parse error — same habit as `onInput` above */
function onCoordinatesInput(): void {
  coordinatesError.value = ''
}

async function fetchByCoordinates(latitude: number, longitude: number): Promise<void> {
  distanceLoading.value = true
  distanceLoadError.value = ''
  try {
    const answer = await adminRepository.listDispatchCandidatesByCoordinates(
      latitude,
      longitude,
      filter.value,
    )
    distanceCandidates.value = answer.items
  } catch (error) {
    distanceLoadError.value = extractErrorMessage(error, 'Վարորդներին բեռնել չհաջողվեց։')
    distanceCandidates.value = []
  } finally {
    distanceLoading.value = false
  }
}

function searchByCoordinates(): void {
  const result = parseCoordinates(coordinatesText.value)
  if (!result.ok) {
    coordinatesError.value = result.error
    return
  }
  coordinatesError.value = ''
  lastCoordinates.value = { latitude: result.latitude, longitude: result.longitude }
  referredIds.value = new Set()
  void fetchByCoordinates(result.latitude, result.longitude)
}

/**
 * The third search, and the only one that is not asking the page's question.
 *
 * «Ըստ վայրի» and «Ըստ կոորդինատների» both ask "who should take this job".
 * This one asks "where is this driver" — the dispatcher referred somebody an
 * hour ago and now needs them on the phone, and the alternative was leaving
 * this screen for the admin panel mid-call.
 *
 * ## No «Ուղղորդված է» on these cards
 *
 * Not an omission. A referral is stored against a place — `locationSlug`,
 * `locationName`, `locationType` are all required by the endpoint — and a name
 * typed into a box is not one. The place and coordinate searches can both
 * answer that question; this one cannot, and inventing a placeholder location
 * to make the button fit would put rows in the referral log that no report can
 * read. Call, and open the profile. The two searches that know where the job
 * is are where a referral gets recorded.
 *
 * ## Why it reuses the admin list endpoint
 *
 * `GET /admin/tow-trucks?search=` already matches driver name, company name
 * and phone server-side — the same query the panel's own search box sends. A
 * dispatch-specific endpoint would be a second definition of "matches a
 * driver", and the day they disagreed, the panel and this screen would
 * disagree about who exists.
 *
 * The cost is a thinner card: `AdminTowTruck` carries no tier, no dispatch
 * counts and no subscription status. All three are answers to "should this
 * driver get the job", which is the question this search is not asking.
 */
const DRIVER_SEARCH_MIN_LENGTH = 2
/** Long enough that typing a seven-digit number is one request, not seven */
const DRIVER_SEARCH_DEBOUNCE_MS = 300
const DRIVER_SEARCH_LIMIT = 20

const driverQuery = ref('')
const driverResults = ref<AdminTowTruck[]>([])
const driverLoading = ref(false)
const driverError = ref('')
/** False until a request has come back, so "nothing found" cannot show before one has */
const driverSearched = ref(false)
let driverTimer: ReturnType<typeof setTimeout> | null = null

/** The same string the dispatch cards show, composed the same way the backend composes it */
function driverVehicle(driver: AdminTowTruck): string {
  return [driver.vehicleBrand, driver.vehicleModel].filter(Boolean).join(' ')
}

async function fetchDrivers(search: string): Promise<void> {
  driverLoading.value = true
  driverError.value = ''
  try {
    driverResults.value = await adminRepository.listTowTrucks({
      search,
      limit: DRIVER_SEARCH_LIMIT,
    })
  } catch (error) {
    driverError.value = extractErrorMessage(error, 'Վարորդներին բեռնել չհաջողվեց։')
    driverResults.value = []
  } finally {
    driverLoading.value = false
    driverSearched.value = true
  }
}

/**
 * Debounced, unlike the place search above — that one reads a static index in
 * memory, this one is a request, and the dispatcher is typing while talking.
 */
function onDriverInput(): void {
  if (driverTimer !== null) clearTimeout(driverTimer)
  const term = driverQuery.value.trim()
  if (term.length < DRIVER_SEARCH_MIN_LENGTH) {
    driverResults.value = []
    driverError.value = ''
    driverSearched.value = false
    return
  }
  driverTimer = setTimeout(() => void fetchDrivers(term), DRIVER_SEARCH_DEBOUNCE_MS)
}

function resetDriverSearch(): void {
  if (driverTimer !== null) clearTimeout(driverTimer)
  driverQuery.value = ''
  driverResults.value = []
  driverError.value = ''
  driverSearched.value = false
}

// A pending debounce outliving the page would fire a request for a screen
// nobody is looking at, with a token that may already be gone.
onUnmounted(() => {
  if (driverTimer !== null) clearTimeout(driverTimer)
})

function resetCoordinates(): void {
  coordinatesText.value = ''
  coordinatesError.value = ''
  lastCoordinates.value = null
  distanceCandidates.value = []
  distanceLoadError.value = ''
  referredIds.value = new Set()
}

// One filter dropdown, shared by both searches — re-runs whichever search is
// currently active (either can be, since switching `mode` does not clear the
// other's state).
watch(filter, () => {
  if (selected.value) void load()
  if (lastCoordinates.value) void fetchByCoordinates(lastCoordinates.value.latitude, lastCoordinates.value.longitude)
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
const confirmTarget = ref<DispatchCandidate | DispatchCandidateByDistance | null>(null)
/**
 * Its own error, not `loadError`: that one belongs to the list behind the
 * dialog, and showing a stale "could not load" inside a confirmation the
 * operator just opened would read as this action having failed.
 */
const referError = ref('')

/**
 * The place to attribute the open confirmation's referral to, for whichever
 * search produced the candidate in it. Place mode has `selected`; coordinate
 * mode has no named place, so the pair itself becomes the record — formatted
 * the same way the toolbar above the list already shows it, and tagged
 * `'coordinates'` rather than borrowed from the four real place kinds (see
 * `DispatchReferralLocationType` on the backend).
 */
const confirmLocation = computed<{ slug: string; name: string; type: string } | null>(() => {
  if (mode.value === 'place') {
    return selected.value
  }
  if (!lastCoordinates.value) return null
  const { latitude, longitude } = lastCoordinates.value
  return {
    slug: `coords:${latitude},${longitude}`,
    name: formatCoordinates(latitude, longitude),
    type: 'coordinates',
  }
})

function askReferred(candidate: DispatchCandidate | DispatchCandidateByDistance): void {
  if (referringId.value !== null || referredIds.value.has(candidate.id)) return
  referError.value = ''
  confirmTarget.value = candidate
}

async function markReferred(candidate: DispatchCandidate | DispatchCandidateByDistance): Promise<void> {
  const place = confirmLocation.value
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

function lastDispatchedLabel(candidate: { lastDispatchedAt?: string }): string {
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
      <!-- The two searches ask the same question two different ways — see the
           `mode` doc comment in the script. -->
      <div class="dispatch__mode-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'place'"
          class="dispatch__mode-btn"
          :class="{ 'dispatch__mode-btn--active': mode === 'place' }"
          @click="setMode('place')"
        >
          Ըստ վայրի
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'coordinates'"
          class="dispatch__mode-btn"
          :class="{ 'dispatch__mode-btn--active': mode === 'coordinates' }"
          @click="setMode('coordinates')"
        >
          Ըստ կոորդինատների
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'driver'"
          class="dispatch__mode-btn"
          :class="{ 'dispatch__mode-btn--active': mode === 'driver' }"
          @click="setMode('driver')"
        >
          Ըստ վարորդի
        </button>
      </div>

      <template v-if="mode === 'place'">
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
                <!-- A link, and a new tab on purpose: this screen is read with
                     somebody on the phone, and navigating away would throw away
                     the search that produced the list. -->
                <NuxtLink
                  :to="getTowTruckRoute(candidate.slug)"
                  target="_blank"
                  class="dispatch__name"
                >
                  {{ candidate.driverName }}
                  <span v-if="candidate.isFeatured" title="Լավագույններից">★</span>
                  <AppBadge v-if="candidate.isPartner" variant="primary">Մեր վարորդ</AppBadge>
                </NuxtLink>
                <!-- The truck, then the two specs a dispatcher decides on while
                     the customer is still describing the car: will it fit, and
                     will it load if the wheels do not turn. Capacity goes
                     through the same `capacityDisplayText` the public profile
                     uses, so the dispatcher and the customer are reading one
                     figure rather than two spellings of it. -->
                <span class="dispatch__muted">
                  {{ candidate.vehicle }} · {{ capacityDisplayText(candidate.capacityTons) }}
                </span>
                <!-- Only when true. Several vehicle types are never asked (see
                     `asksWheelSkates`), so a «Ռոլիկներ՝ ոչ» line would be
                     answering a question nobody put to that driver. -->
                <span v-if="candidate.wheelSkates" class="dispatch__skates">
                  <AppIcon name="check" :size="13" /> Անիվային ռոլիկներ
                </span>
              </div>

              <p class="dispatch__meta">
                <span v-if="candidate.rating">⭐ {{ candidate.rating }}</span>
                <!-- Demand, beside supply: how often customers rang this driver
                     over the last 30 days, next to how often we handed them a
                     job this month. The first is the market's answer, the
                     second is ours. -->
                <span>{{ candidate.callsRecent }} զանգ · 30 օր</span>
                <span>{{ candidate.dispatchesThisMonth }} այս ամիս</span>
                <span>{{ lastDispatchedLabel(candidate) }}</span>
              </p>

              <p class="dispatch__base">
                <AppIcon name="map" :size="14" />
                Հիմնական գտնվելու վայրը՝ {{ candidate.baseName }}
              </p>
              <p v-if="candidate.subscriptionStatus === 'overdue'" class="dispatch__warn">
                բաժանորդագրությունը սպառվել է
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

      <template v-else-if="mode === 'coordinates'">
        <!-- Coordinate search: paste the pair, or open Google Maps to find it
             first — same field and same Maps link every driver already knows
             from registration, just without the driver-facing steps
             (`show-guidance="false"`, same as the admin correction dialog). -->
        <div class="dispatch__coordinates">
          <CoordinatesInput
            v-model="coordinatesText"
            :show-guidance="false"
            :error="coordinatesError"
            @update:model-value="onCoordinatesInput"
          />

          <div class="dispatch__coordinates-actions">
            <AppButton :disabled="distanceLoading" @click="searchByCoordinates">Փնտրել</AppButton>
            <button
              v-if="lastCoordinates"
              type="button"
              class="dispatch__back"
              @click="resetCoordinates"
            >
              Մաքրել
            </button>
          </div>

          <template v-if="lastCoordinates">
            <div class="dispatch__toolbar">
              <strong>{{ formatCoordinates(lastCoordinates.latitude, lastCoordinates.longitude) }}</strong>
              <select v-model="filter" class="dispatch__filter" aria-label="Ֆիլտր">
                <option v-for="(label, value) in FILTER_LABELS" :key="value" :value="value">
                  {{ label }}
                </option>
              </select>
            </div>

            <p v-if="distanceLoadError" class="dispatch__error" role="alert">{{ distanceLoadError }}</p>
            <p v-if="distanceLoading" class="dispatch__muted">Բեռնվում է…</p>

            <p v-else-if="distanceCandidates.length === 0" class="dispatch__empty">
              Այս կետի շուրջ վարորդ չի գտնվել։
              <template v-if="filter !== 'all'">Փորձեք «Բոլորը» ֆիլտրով։</template>
            </p>

            <section v-else class="dispatch__group">
              <h2 class="dispatch__group-title">Ամենամոտները · {{ distanceCandidates.length }}</h2>

              <article
                v-for="candidate in distanceCandidates"
                :key="candidate.id"
                class="dispatch__card"
                :class="{ 'dispatch__card--referred': referredIds.has(candidate.id) }"
              >
                <div class="dispatch__who">
                  <!-- A link, and a new tab on purpose: this screen is read with
                       somebody on the phone, and navigating away would throw away
                       the search that produced the list. -->
                  <NuxtLink
                    :to="getTowTruckRoute(candidate.slug)"
                    target="_blank"
                    class="dispatch__name"
                  >
                    {{ candidate.driverName }}
                    <span v-if="candidate.isFeatured" title="Լավագույններից">★</span>
                    <AppBadge v-if="candidate.isPartner" variant="primary">Մեր վարորդ</AppBadge>
                  </NuxtLink>
                  <span class="dispatch__muted">{{ candidate.vehicle }}</span>
                </div>

                <p class="dispatch__meta">
                  <span>{{ formatDistanceLine(candidate.distanceMeters, false) }}</span>
                  <span v-if="candidate.rating">⭐ {{ candidate.rating }}</span>
                  <span>{{ candidate.dispatchesThisMonth }} այս ամիս</span>
                  <span>{{ lastDispatchedLabel(candidate) }}</span>
                </p>

                <p class="dispatch__base">
                  <AppIcon name="map" :size="14" />
                  Հիմնական գտնվելու վայրը՝ {{ candidate.baseName }}
                </p>
                <p v-if="candidate.subscriptionStatus === 'overdue'" class="dispatch__warn">
                  բաժանորդագրությունը սպառվել է
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
        </div>
      </template>

      <!-- Find a driver, rather than find a driver FOR something — see the
           `fetchDrivers` comment in the script for why these cards carry no
           «Ուղղորդված է». -->
      <template v-else>
        <div class="dispatch__search">
          <AppInput
            v-model="driverQuery"
            label="Վարորդի անունը կամ հեռախոսը"
            placeholder="Արամ, ՍՊԸ-ի անունը, 077…"
            autocomplete="off"
            @update:model-value="onDriverInput"
          />

          <div v-if="driverQuery" class="dispatch__toolbar">
            <button type="button" class="dispatch__back" @click="resetDriverSearch">
              Մաքրել
            </button>
          </div>

          <p v-if="driverError" class="dispatch__error" role="alert">{{ driverError }}</p>
          <p v-else-if="driverLoading" class="dispatch__muted">Բեռնվում է…</p>
          <p
            v-else-if="driverQuery.trim().length < DRIVER_SEARCH_MIN_LENGTH"
            class="dispatch__muted"
          >
            Անուն, ընկերություն կամ հեռախոսահամար՝ գոնե երկու նիշ։
          </p>
          <p v-else-if="driverSearched && driverResults.length === 0" class="dispatch__empty">
            Այդպիսի վարորդ չգտնվեց։
          </p>

          <article v-for="driver in driverResults" :key="driver.id" class="dispatch__card">
            <div class="dispatch__who">
              <NuxtLink
                :to="getTowTruckRoute(driver.slug)"
                target="_blank"
                class="dispatch__name"
              >
                {{ driver.driverName }}
                <span v-if="driver.isFeatured" title="Լավագույններից">★</span>
                <AppBadge v-if="driver.isPartner" variant="primary">Մեր վարորդ</AppBadge>
              </NuxtLink>
              <span class="dispatch__muted">{{ driverVehicle(driver) }}</span>
            </div>

            <!-- Shown here and not on the other two lists because they only
                 ever contain active drivers. This search finds anyone by name,
                 and a deactivated driver is exactly who an operator might be
                 calling about. -->
            <p v-if="!driver.isActive" class="dispatch__warn">էջը ապաակտիվացված է</p>

            <p class="dispatch__base">
              <AppIcon name="map" :size="14" />
              Հիմնական գտնվելու վայրը՝ {{ driver.locationName }}
            </p>

            <div class="dispatch__actions">
              <a :href="getPhoneHref(driver.phone)" class="dispatch__call">
                Զանգել · {{ driver.phone }}
              </a>
            </div>
          </article>
        </div>
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
          Հաստատում եք, որ այս վարորդը վերցրե՞լ է պատվերը՝ {{ confirmLocation?.name }}։
          Գրառումը կավելանա իր ամսվա հաշվին և հետ չի վերցվում։
        </p>
        <p v-if="referError" class="dispatch__error" role="alert">{{ referError }}</p>
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

  &__mode-toggle {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  &__mode-btn {
    flex: 1;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;

    &--active {
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: #fff;
    }
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

  &__coordinates {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  &__coordinates-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
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
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-weight: 600;
    font-size: 1.05rem;
    color: var(--color-text);

    // Underlined on hover only: a dozen underlined names reads as a wall of
    // links, and this is a name first and a link second.
    &:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }
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

  /* An accent chip rather than another muted line: it is the one capability
     on this card that decides whether a driver can take THIS car at all. */
  &__skates {
    display: inline-flex;
    align-items: center;
    /* `__who` is a stretching column, so without this the chip spans the card
       and stops reading as a chip. */
    align-self: flex-start;
    gap: 4px;
    margin-top: var(--space-1);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: rgba(20, 48, 79, 0.08);
    color: var(--color-primary);
    font-size: 0.78rem;
    font-weight: 600;
  }

  &__base {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.9rem;
    color: var(--color-text-secondary);

    svg {
      flex-shrink: 0;
      color: var(--color-text-muted);
    }
  }

  &__warn {
    color: var(--color-danger, #c53030);
    font-size: 0.9rem;
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
