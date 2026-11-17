<script setup lang="ts">
/**
 * Live dispatch console — orders list, NEEDS_ATTENTION queue, alerts, new
 * order form and the driver map. ADMIN or DISPATCHER (the API decides; this
 * page only needs an admin-panel session).
 *
 * Creating an order and starting the automatic search are two separate
 * buttons, on purpose: an order is usually created while the customer is
 * still on the phone, and the search starts when the details are right.
 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import OpsDriverMap from '~/components/ops/OpsDriverMap.vue'
import OrderFormFields from '~/components/ops/OrderFormFields.vue'
import { SHOW_OPS_DRIVER_MAP } from '~/constants/admin'
import { isApiEnabled } from '~/repositories'
import { newIdempotencyKey, opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type { OpsAlert, OpsMapDriver, OpsOrder, OrderStatus } from '~/types/opsDispatch'
import { listIncident } from '~/utils/orderIncidents'
import { blankOrderForm, buildOrderBody } from '~/utils/orderForm'
import { formatDateNumeric, formatClockTime } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { useOpsRealtime } from '~/composables/useOpsRealtime'
import {
  ATTENTION_LABEL,
  alertLabel,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  apiErrorText,
  availabilitySummary,
  formatAge,
  formatArmenianPhone,
} from '~/utils/opsDispatchLabels'

const adminAuth = useAdminAuthStore()
const apiEnabled = isApiEnabled()

type Tab = 'active' | 'attention' | 'all' | 'done'
const TAB_STATUSES: Record<Tab, OrderStatus[] | undefined> = {
  active: ['DRAFT', 'SEARCHING', 'PRICE_CONFIRMATION_PENDING', 'ASSIGNED', 'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'TRANSPORTING'],
  attention: ['NEEDS_ATTENTION'],
  all: undefined,
  done: ['COMPLETED', 'CANCELLED'],
}
const tab = ref<Tab>('active')
const search = ref('')
const orders = ref<OpsOrder[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const alerts = ref<OpsAlert[]>([])
const drivers = ref<OpsMapDriver[]>([])
const gpsMaxAgeSeconds = ref(120)
const mapBbox = ref<string | null>(null)
const onlyOnline = ref(true)
const selectedDriver = ref<number | null>(null)
const lastRefresh = ref<Date | null>(null)

async function loadOrders(reset = true) {
  if (!adminAuth.isLoggedIn) return
  loading.value = true
  loadError.value = null
  try {
    const page = await opsDispatchRepository.listOrders({
      status: TAB_STATUSES[tab.value]?.join(','),
      search: search.value.trim() || undefined,
      limit: 25,
      cursor: reset ? null : nextCursor.value,
    })
    orders.value = reset ? page.items : [...orders.value, ...page.items]
    nextCursor.value = page.nextCursor
    lastRefresh.value = new Date()
  } catch (error) {
    loadError.value = apiErrorText(error, 'Պատվերները բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
  }
}

async function loadSide() {
  if (!adminAuth.isLoggedIn) return
  const [alertList, map] = await Promise.allSettled([
    opsDispatchRepository.alerts(),
    opsDispatchRepository.driverMap({ bbox: mapBbox.value ?? undefined, onlyOnline: onlyOnline.value }),
  ])
  if (alertList.status === 'fulfilled') alerts.value = alertList.value
  if (map.status === 'fulfilled') {
    drivers.value = map.value.items
    gpsMaxAgeSeconds.value = map.value.gpsMaxAgeSeconds
  }
}

function setTab(next: Tab) {
  tab.value = next
  void loadOrders()
}

/**
 * Rows with a problem (2026-11-16, utils/orderIncidents.ts): each gets a
 * coloured chip, and the ones that need the operator NOW — a driver asking to
 * cancel, a problem, a driver who withdrew, any NEEDS_ATTENTION — go to the
 * top. The rest keep the server's order.
 */
const rows = computed(() => {
  const withIncident = orders.value.map((order, index) => ({ order, index, incident: listIncident(order, alerts.value) }))
  return withIncident.sort((a, b) => Number(!!b.incident?.urgent) - Number(!!a.incident?.urgent) || a.index - b.index)
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void loadOrders(), 350)
}

/**
 * The same alert for the same order repeats (a lost GPS is re-raised every few
 * minutes): one row per order + kind, with how many times and when last —
 * 57 identical lines hid everything else (2026-11-12).
 */
interface AlertGroup { key: string; orderId: number; kind: string; label: string; ids: number[]; first: string; last: string }
const alertGroups = computed<AlertGroup[]>(() => {
  const groups = new Map<string, AlertGroup>()
  for (const a of alerts.value) {
    const key = `${a.orderId}:${a.kind}`
    const g = groups.get(key)
    if (!g) groups.set(key, { key, orderId: a.orderId, kind: a.kind, label: alertLabel(a), ids: [a.id], first: a.createdAt, last: a.createdAt })
    else {
      g.ids.push(a.id)
      if (a.createdAt < g.first) g.first = a.createdAt
      if (a.createdAt > g.last) g.last = a.createdAt
    }
  }
  return [...groups.values()].sort((x, y) => y.last.localeCompare(x.last))
})
const alertsOpen = ref(true)
const ackingAll = ref(false)

function alertTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today ? formatClockTime(d) : `${formatDateNumeric(iso)} ${formatClockTime(d)}`
}

async function ackIds(ids: number[]) {
  // No bulk endpoint: a few at a time, so 50 acks do not take 50 round trips in a row
  const queue = [...ids]
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()!
      await opsDispatchRepository.ackAlert(id).catch(() => undefined)
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, ids.length) }, worker))
  const done = new Set(ids)
  alerts.value = alerts.value.filter((a) => !done.has(a.id))
}

async function ackGroup(group: AlertGroup) {
  await ackIds(group.ids)
}

async function ackAll() {
  if (!(await confirmDialog({ message: `Նշե՞լ բոլոր ${alerts.value.length} ազդանշանները որպես տեսած։`, confirmLabel: 'Այո, տեսա' }))) return
  ackingAll.value = true
  try {
    await ackIds(alerts.value.map((a) => a.id))
  } finally {
    ackingAll.value = false
  }
}

// Realtime: any order change → re-read; reconnect → re-read everything.
const { connected } = useOpsRealtime(
  () => {
    void loadOrders()
    void loadSide()
  },
  () => {
    void loadOrders()
    void loadSide()
  },
)

// Polling as a floor under the WebSocket (and the map's only feed: positions
// are not pushed per GPS point to every console).
let poll: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  adminAuth.init()
  void loadOrders()
  void loadSide()
  poll = setInterval(() => void loadSide(), 15_000)
})
onUnmounted(() => {
  if (poll) clearInterval(poll)
})

const attentionCount = computed(() => orders.value.filter((o) => o.status === 'NEEDS_ATTENTION').length)

// ─── New order ──────────────────────────────────────────────────────────────

const showForm = ref(false)
// State, rules and body: utils/orderForm.ts, shared with the edit form on the order page
const form = reactive(blankOrderForm())
const formError = ref<string | null>(null)
const saving = ref(false)
/** Every app driver, for «Փոխանցող վարորդ» (2026-11-17) — the map list may be filtered */
const referrerChoices = ref<OpsMapDriver[]>([])
async function toggleForm() {
  showForm.value = !showForm.value
  if (showForm.value && referrerChoices.value.length === 0) {
    referrerChoices.value = (await opsDispatchRepository.driverMap({}).catch(() => ({ items: [] as OpsMapDriver[] }))).items
  }
}
let createKey = newIdempotencyKey()
const triedSubmit = ref(false)

async function createOrder() {
  formError.value = null
  triedSubmit.value = true
  const built = buildOrderBody(form)
  if (!built.ok) {
    formError.value = built.error
    return
  }
  saving.value = true
  try {
    const created = await opsDispatchRepository.createOrder(built.body, createKey)
    createKey = newIdempotencyKey()
    showForm.value = false
    await navigateTo(`/admin/orders/${created.id}`)
  } catch (error) {
    formError.value = apiErrorText(error, 'Պատվերը ստեղծել չհաջողվեց։')
  } finally {
    saving.value = false
  }
}

useSeoMetaData({ title: 'Պատվերներ', description: 'Պատվերների կառավարում', path: '/admin/orders', noindex: true })
</script>

<template>
  <div class="container ops">
    <OpsNav :live="adminAuth.isLoggedIn ? connected : null" />
    <h1 class="ops__title">Պատվերներ</h1>

    <EmptyState v-if="!apiEnabled" title="Backend API-ն միացված չէ" icon="info" />
    <EmptyState v-else-if="!adminAuth.isLoggedIn" title="Մուտք գործեք" description="Բացեք ադմին վահանակը և մուտք գործեք։" icon="info" />

    <template v-else>
      <section v-if="alerts.length" class="ops__alerts" aria-live="polite">
        <div class="ops__alerts-head">
          <h2 class="ops__h2">
            Ազդանշաններ ({{ alerts.length }})
            <span v-if="alertGroups.length !== alerts.length" class="ops__muted">· {{ alertGroups.length }} խումբ</span>
          </h2>
          <div class="ops__alerts-actions">
            <button type="button" class="ops__ack" :disabled="ackingAll" @click="ackAll">{{ ackingAll ? 'Նշվում է…' : 'Տեսա բոլորը' }}</button>
            <button type="button" class="ops__ack" @click="alertsOpen = !alertsOpen">{{ alertsOpen ? 'Թաքցնել' : 'Ցույց տալ' }}</button>
          </div>
        </div>
        <ul v-if="alertsOpen" class="ops__alerts-list">
          <li v-for="g in alertGroups" :key="g.key" class="ops__alert">
            <NuxtLink :to="`/admin/orders/${g.orderId}`">#{{ g.orderId }}</NuxtLink>
            {{ g.label }}
            <span v-if="g.ids.length > 1" class="ops__count">×{{ g.ids.length }}</span>
            <span class="ops__muted">
              <template v-if="g.ids.length > 1">{{ alertTime(g.first) }} – </template>{{ alertTime(g.last) }}
            </span>
            <button type="button" class="ops__ack" @click="ackGroup(g)">Տեսա</button>
          </li>
        </ul>
      </section>

      <div class="ops__grid">
        <section class="ops__orders">
          <div class="ops__toolbar">
            <div class="ops__tabs" role="tablist">
              <button type="button" role="tab" :aria-selected="tab === 'active'" :class="{ active: tab === 'active' }" @click="setTab('active')">Ակտիվ</button>
              <button type="button" role="tab" :aria-selected="tab === 'attention'" :class="{ active: tab === 'attention', danger: true }" @click="setTab('attention')">
                Ուշադրություն{{ tab === 'attention' && attentionCount ? ` (${attentionCount})` : '' }}
              </button>
              <button type="button" role="tab" :aria-selected="tab === 'done'" :class="{ active: tab === 'done' }" @click="setTab('done')">Փակված</button>
              <button type="button" role="tab" :aria-selected="tab === 'all'" :class="{ active: tab === 'all' }" @click="setTab('all')">Բոլորը</button>
            </div>
            <input v-model="search" class="ops__search" type="search" placeholder="Համար, հեռախոս կամ հասցե" @input="onSearchInput" />
            <AppButton variant="accent" size="sm" @click="toggleForm">{{ showForm ? 'Փակել' : '+ Նոր պատվեր' }}</AppButton>
          </div>

          <form v-if="showForm" class="ops__form" novalidate @submit.prevent="createOrder">
            <h2 class="ops__h2">Նոր պատվեր (սևագիր)</h2>
            <OrderFormFields v-model="form" :tried-submit="triedSubmit" :drivers="referrerChoices" />
            <p v-if="formError" class="ops__error" role="alert">{{ formError }}</p>
            <AppButton type="submit" :disabled="saving">{{ saving ? 'Պահպանվում է…' : 'Ստեղծել սևագիր' }}</AppButton>
          </form>

          <p v-if="loadError" class="ops__error" role="alert">{{ loadError }}</p>
          <table v-if="orders.length" class="ops__table">
            <thead>
              <tr>
                <th>Համար</th>
                <th>Վիճակ</th>
                <th>Վերցնելու հասցե</th>
                <th>Հաճախորդ</th>
                <th>Գին</th>
                <th>Ստեղծված</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="{ order, incident } in rows"
                :key="order.id"
                class="ops__row"
                :class="incident ? `ops__row--${incident.tone}${incident.urgent ? ' ops__row--urgent' : ''}` : ''"
                @click="navigateTo(`/admin/orders/${order.id}`)"
              >
                <td><NuxtLink :to="`/admin/orders/${order.id}`">{{ order.number }}</NuxtLink></td>
                <td>
                  <AppBadge :variant="ORDER_STATUS_VARIANT[order.status]">{{ ORDER_STATUS_LABEL[order.status] }}</AppBadge>
                  <div v-if="incident" class="ops__chip" :class="`ops__chip--${incident.tone}`">{{ incident.label }}</div>
                  <div v-else-if="order.attentionKind" class="ops__muted">{{ ATTENTION_LABEL[order.attentionKind] }}</div>
                </td>
                <td>{{ order.pickup.address }}</td>
                <td>{{ formatArmenianPhone(order.customer.phone) }}</td>
                <td>
                  <template v-if="order.price.mode === 'FIXED' && order.price.quotedAmd !== null">{{ formatPrice(order.price.quotedAmd) }}</template>
                  <template v-else-if="order.price.agreedAmd !== null">{{ formatPrice(order.price.agreedAmd) }}</template>
                  <template v-else><span class="ops__muted">համաձայնեցվելու է</span></template>
                </td>
                <td>{{ formatDateNumeric(order.timestamps.createdAt!) }} {{ formatClockTime(new Date(order.timestamps.createdAt!)) }}</td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-else-if="!loading" title="Պատվերներ չկան" icon="info" />
          <AppButton v-if="nextCursor" variant="outline" size="sm" :disabled="loading" @click="loadOrders(false)">Ավելին</AppButton>
          <p v-if="lastRefresh" class="ops__muted">Թարմացված՝ {{ formatClockTime(lastRefresh) }}</p>
        </section>

        <aside class="ops__side">
          <h2 class="ops__h2">Վարորդներ</h2>
          <label class="ops__radio"><input v-model="onlyOnline" type="checkbox" @change="loadSide" /> Միայն պատվերներ ընդունողները</label>
          <OpsDriverMap
            v-if="SHOW_OPS_DRIVER_MAP"
            :drivers="drivers"
            :gps-max-age-seconds="gpsMaxAgeSeconds"
            :selected-id="selectedDriver"
            @select="selectedDriver = $event"
            @viewport="(b) => { mapBbox = b; loadSide() }"
          />
          <ul class="ops__drivers">
            <li v-for="d in drivers" :key="d.driverId" :class="{ selected: selectedDriver === d.driverId }" @click="selectedDriver = d.driverId">
              <strong>{{ d.driverName }}</strong>
              <span :class="`tone-${availabilitySummary(d.availability).tone}`">{{ availabilitySummary(d.availability).text }}</span>
              <span class="ops__muted">GPS {{ formatAge(d.availability.gpsAgeSeconds) }}<template v-if="d.position?.accuracyM"> · ±{{ Math.round(d.position.accuracyM) }} մ</template></span>
              <NuxtLink v-if="d.activeOrderId" :to="`/admin/orders/${d.activeOrderId}`">պատվեր #{{ d.activeOrderId }}</NuxtLink>
              <a
                v-if="d.position"
                :href="`https://maps.google.com/?q=${d.position.latitude},${d.position.longitude}`"
                target="_blank"
                rel="noopener"
                @click.stop
              >Google Maps</a>
            </li>
          </ul>
          <p v-if="!drivers.length" class="ops__muted">{{ onlyOnline ? 'Հիմա պատվերներ ընդունող վարորդ չկա։' : 'Վարորդներ չկան։' }}</p>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ops {
  padding-top: var(--space-5);
  padding-bottom: var(--space-8);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  &__title {
    margin: 0 0 var(--space-4);
    font-size: 1.4rem;
  }
  &__header-actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
  &__link {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }
  &__live {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    &--on {
      color: var(--color-success);
    }
  }
  &__grid {
    display: grid;
    gap: var(--space-5);
    grid-template-columns: minmax(0, 1fr);
    @media (min-width: 1100px) {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }
  }
  &__h2 {
    font-size: 1.05rem;
    margin: 0 0 var(--space-2);
  }
  &__alerts {
    background: var(--color-danger-bg);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-4);
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
  }
  &__alerts-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  &__alerts-actions {
    display: flex;
    gap: var(--space-2);
  }
  &__alerts-list {
    max-height: 400px;
    overflow-y: auto;
    padding-right: var(--space-2) !important;
  }
  &__count {
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--color-surface);
  }
  &__alert {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: 4px 0;
  }
  &__alert &__ack {
    margin-left: auto;
  }
  &__ack {
    padding: 2px 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  &__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-3);
  }
  &__tabs {
    display: flex;
    gap: var(--space-1);
    button {
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      border-radius: var(--radius-full);
      padding: 4px 12px;
      cursor: pointer;
      &.active {
        background: var(--color-primary);
        color: #fff;
      }
      &.danger.active {
        background: var(--color-danger);
      }
    }
  }
  &__search {
    flex: 1;
    min-width: 180px;
    padding: 6px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  &__form {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    display: grid;
    gap: var(--space-3);
  }

  &__error {
    color: var(--color-danger);
  }
  &__table {
    width: 100%;
    border-collapse: collapse;
    background: var(--color-surface);
    border-radius: var(--radius-md);
    overflow: hidden;
    th,
    td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid var(--color-border);
      font-size: 0.9rem;
      vertical-align: top;
    }
  }
  &__row {
    cursor: pointer;
    &:hover {
      background: var(--color-bg);
    }
    // A problem row: a coloured edge; one that needs the operator now also a tint
    &--danger td:first-child {
      box-shadow: inset 4px 0 0 var(--color-danger);
    }
    &--warn td:first-child {
      box-shadow: inset 4px 0 0 #d97706;
    }
    &--info td:first-child {
      box-shadow: inset 4px 0 0 var(--color-primary);
    }
    &--urgent {
      background: #fff7e6;
    }
  }
  &__chip {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    &--danger {
      background: var(--color-danger-bg);
      color: var(--color-danger);
    }
    &--warn {
      background: #fff1d6;
      color: #92400e;
    }
    &--info {
      background: #e6eef9;
      color: var(--color-primary-dark);
    }
  }
  &__muted {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
  &__drivers {
    list-style: none;
    padding: 0;
    margin: var(--space-3) 0 0;
    max-height: 420px;
    overflow-y: auto;
    li {
      display: grid;
      gap: 2px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--color-border);
      cursor: pointer;
      &.selected {
        background: var(--color-bg);
      }
    }
  }
}
.tone-ok {
  color: var(--color-success);
}
.tone-warn {
  color: var(--color-accent-dark);
}
.tone-off {
  color: var(--color-text-muted);
}
</style>
