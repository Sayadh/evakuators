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
import { SHOW_OPS_DRIVER_MAP } from '~/constants/admin'
import { isApiEnabled } from '~/repositories'
import { newIdempotencyKey, opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type { OpsAlert, OpsMapDriver, OpsOrder, OrderStatus } from '~/types/opsDispatch'
import { formatDateNumeric, formatClockTime } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { useOpsRealtime } from '~/composables/useOpsRealtime'
import {
  ALERT_LABEL,
  ATTENTION_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  apiErrorText,
  availabilitySummary,
  formatAge,
  formatArmenianPhone,
} from '~/utils/opsDispatchLabels'
import { parseCoordinates } from '~/utils/coordinates'

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
interface AlertGroup { key: string; orderId: number; kind: string; ids: number[]; first: string; last: string }
const alertGroups = computed<AlertGroup[]>(() => {
  const groups = new Map<string, AlertGroup>()
  for (const a of alerts.value) {
    const key = `${a.orderId}:${a.kind}`
    const g = groups.get(key)
    if (!g) groups.set(key, { key, orderId: a.orderId, kind: a.kind, ids: [a.id], first: a.createdAt, last: a.createdAt })
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
const form = reactive({
  customerPhone: '',
  customerName: '',
  pickupCoords: '',
  pickupAddress: '',
  destinationCoords: '',
  destinationAddress: '',
  make: '',
  model: '',
  plate: '',
  weightKg: '' as string,
  problemDescription: '',
  wheelsRoll: null as boolean | null,
  steeringLocked: null as boolean | null,
  gearboxLocked: null as boolean | null,
  needsManipulator: null as boolean | null,
  needsWheelSkates: null as boolean | null,
  /** '' = not stated; only sent when skates are needed */
  wheelSkatesCount: '' as '' | '1' | '2' | '3' | '4',
  // Default (2026-11-12): the driver calls the customer, agrees the price and
  // must record it before setting off. FIXED only when the operator already
  // agreed a price with the customer (then the driver enters nothing).
  pricingMode: 'NEGOTIATION_REQUIRED' as 'FIXED' | 'NEGOTIATION_REQUIRED',
  quotedPriceAmd: '' as string,
  internalNote: '',
})
const formError = ref<string | null>(null)
const saving = ref(false)
let createKey = newIdempotencyKey()

const TRI = [
  { value: true, label: 'Այո' },
  { value: false, label: 'Ոչ' },
  { value: null, label: 'Չգիտեմ' },
] as const

function quickPassengerCar() {
  form.weightKg = '2000'
}

/** «+374 91 00 00 01», «091000001», «91000001» → +37491000001; null if it is not a number */
function armenianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '')
  const m = /^(?:\+374|00374|374|0)?(\d{8})$/.exec(digits)
  return m ? `+374${m[1]}` : null
}

/** What the operator must fix, said exactly — before the request leaves (2026-11-12) */
function formProblem(): string | null {
  if (!form.customerPhone.trim()) return 'Գրեք հաճախորդի հեռախոսահամարը'
  if (!armenianPhone(form.customerPhone)) return 'Հաճախորդի հեռախոսը սխալ է. գրեք +374XXXXXXXX կամ 0XXXXXXXX ձևով'
  if (form.pickupAddress.trim().length < 2) return 'Գրեք վերցնելու հասցեն'
  if (form.weightKg && (Number(form.weightKg) < 100 || Number(form.weightKg) > 60000)) return 'Քաշը պետք է լինի 100-ից 60 000 կգ'
  if (form.pricingMode === 'FIXED') {
    if (!String(form.quotedPriceAmd).trim()) return 'Ֆիքսված գնի դեպքում գրեք համաձայնեցված գինը (կամ ընտրեք «Վարորդը կհամաձայնեցնի»)'
    const price = Number(form.quotedPriceAmd)
    if (!Number.isInteger(price) || price < 0 || price > 10_000_000) return 'Գինը պետք է լինի ամբողջ թիվ՝ 0-ից 10 000 000 ֏'
  }
  return null
}
const priceMissing = computed(() => form.pricingMode === 'FIXED' && !String(form.quotedPriceAmd).trim())
const triedSubmit = ref(false)

async function createOrder() {
  formError.value = null
  triedSubmit.value = true
  const problem = formProblem()
  if (problem) {
    formError.value = problem
    return
  }
  // Only the pickup address and the phone are mandatory (2026-11). Without
  // pickup coordinates the order can still be created and sent to a driver
  // manually; only the automatic search needs them.
  const parsedPickup = form.pickupCoords.trim() ? parseCoordinates(form.pickupCoords) : null
  if (parsedPickup && !parsedPickup.ok) {
    formError.value = `Վերցնելու կետ՝ ${parsedPickup.error}`
    return
  }
  const pickup = parsedPickup && parsedPickup.ok ? parsedPickup : null
  const parsedDestination = form.destinationCoords.trim() ? parseCoordinates(form.destinationCoords) : null
  if (parsedDestination && !parsedDestination.ok) {
    formError.value = `Հասցման կետ՝ ${parsedDestination.error}`
    return
  }
  const destination = parsedDestination && parsedDestination.ok ? parsedDestination : null
  const body: Record<string, unknown> = {
    customerPhone: form.customerPhone,
    customerName: form.customerName || null,
    pickup: { latitude: pickup?.latitude ?? null, longitude: pickup?.longitude ?? null, address: form.pickupAddress },
    // The description alone is kept too (2026-11) — the driver sees it even
    // without coordinates; only the route figures and navigation need them.
    destination:
      destination || form.destinationAddress.trim()
        ? { latitude: destination?.latitude ?? null, longitude: destination?.longitude ?? null, address: form.destinationAddress.trim() || 'Հասցեն նշված չէ' }
        : null,
    vehicle: { make: form.make || null, model: form.model || null, plate: form.plate || null, weightKg: form.weightKg ? Number(form.weightKg) : null },
    problemDescription: form.problemDescription,
    requirements: {
      wheelsRoll: form.wheelsRoll,
      steeringLocked: form.steeringLocked,
      gearboxLocked: form.gearboxLocked,
      needsManipulator: form.needsManipulator,
      needsWheelSkates: form.needsWheelSkates,
      wheelSkatesCount: form.needsWheelSkates === true && form.wheelSkatesCount ? Number(form.wheelSkatesCount) : null,
    },
    pricing: { mode: form.pricingMode, quotedPriceAmd: form.quotedPriceAmd ? Number(form.quotedPriceAmd) : null },
    internalNote: form.internalNote || null,
  }
  saving.value = true
  try {
    const created = await opsDispatchRepository.createOrder(body, createKey)
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
            {{ ALERT_LABEL[g.kind] ?? g.kind }}
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
            <AppButton variant="accent" size="sm" @click="showForm = !showForm">{{ showForm ? 'Փակել' : '+ Նոր պատվեր' }}</AppButton>
          </div>

          <form v-if="showForm" class="ops__form" novalidate @submit.prevent="createOrder">
            <h2 class="ops__h2">Նոր պատվեր (սևագիր)</h2>
            <div class="row">
              <label>Հաճախորդի հեռախոս*<input v-model="form.customerPhone" required placeholder="+374 91 00 00 01" autocomplete="off" /></label>
              <label>Անուն<input v-model="form.customerName" autocomplete="off" /></label>
            </div>
            <div class="row">
              <label>Վերցնելու կետի կոորդինատներ (եթե կա)<input v-model="form.pickupCoords" placeholder="40.1772, 44.5126" /></label>
              <label>Վերցնելու հասցե/նկարագրություն*<input v-model="form.pickupAddress" required minlength="2" /></label>
            </div>
            <div class="row">
              <label>Հասցման կետի կոորդինատներ (եթե կա)<input v-model="form.destinationCoords" placeholder="Եթե հայտնի է" /></label>
              <label>Հասցման կետի նկարագրություն<input v-model="form.destinationAddress" /></label>
            </div>
            <p class="ops__hint">Կոորդինատները պատճենեք Google Maps-ից (երկար սեղմում կետի վրա)։ Առանց վերցնելու կետի կոորդինատների ավտոմատ որոնումը չի աշխատի․ պատվերը կուղարկեք կոնկրետ վարորդի ձեռքով։</p>
            <div class="row">
              <label>Մակնիշ<input v-model="form.make" /></label>
              <label>Մոդել<input v-model="form.model" /></label>
              <label>Համարանիշ<input v-model="form.plate" /></label>
              <label>Քաշ (կգ)<input v-model="form.weightKg" type="number" min="100" max="60000" /></label>
            </div>
            <button type="button" class="ops__chip" @click="quickPassengerCar">Սովորական մարդատար ≈ 2000 կգ</button>
            <label>Խնդիրը<textarea v-model="form.problemDescription" rows="2" /></label>
            <fieldset class="ops__tri">
              <legend>Տեխնիկական վիճակ (ըստ ցանկության)</legend>
              <div v-for="field in (['wheelsRoll', 'steeringLocked', 'gearboxLocked', 'needsManipulator', 'needsWheelSkates'] as const)" :key="field" class="ops__tri-row">
                <span>{{ { wheelsRoll: 'Անիվները պտտվում են', steeringLocked: 'Ղեկն արգելափակված է', gearboxLocked: 'Տուփն արգելափակված է', needsManipulator: 'Պետք է մանիպուլյատոր', needsWheelSkates: 'Պետք են անիվային ռոլիկներ' }[field] }}</span>
                <label v-for="option in TRI" :key="String(option.value)" class="ops__radio">
                  <input v-model="form[field]" type="radio" :name="field" :value="option.value" /> {{ option.label }}
                </label>
              </div>
              <div v-if="form.needsWheelSkates === true" class="ops__tri-row">
                <span>Ռոլիկների քանակ (ըստ ցանկության)</span>
                <select v-model="form.wheelSkatesCount">
                  <option value="">— նշված չէ —</option>
                  <option v-for="n in ['1', '2', '3', '4']" :key="n" :value="n">{{ n }}</option>
                </select>
              </div>
              <p v-if="form.needsWheelSkates === true" class="ops__hint">
                Պատվերը կառաջարկվի միայն անիվային ռոլիկներ ունեցող վարորդներին։ Քանակը կտեսնի վարորդը. ըստ քանակի ֆիլտր չկա, որովհետև պրոֆիլներում ռոլիկների թիվը նշված չէ։
              </p>
            </fieldset>
            <fieldset class="ops__pricing">
              <legend>Գին</legend>
              <div class="ops__price-modes" role="radiogroup" aria-label="Գնի տեսակ">
                <button
                  type="button"
                  role="radio"
                  class="ops__price-mode"
                  :class="{ on: form.pricingMode === 'NEGOTIATION_REQUIRED' }"
                  :aria-checked="form.pricingMode === 'NEGOTIATION_REQUIRED'"
                  @click="form.pricingMode = 'NEGOTIATION_REQUIRED'"
                >
                  <strong>Վարորդը կհամաձայնեցնի</strong>
                  <span>Զանգում է հաճախորդին և գրում գինը հավելվածում՝ պարտադիր մինչ շարժվելը</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  class="ops__price-mode"
                  :class="{ on: form.pricingMode === 'FIXED' }"
                  :aria-checked="form.pricingMode === 'FIXED'"
                  @click="form.pricingMode = 'FIXED'"
                >
                  <strong>Ֆիքսված գին</strong>
                  <span>Դուք արդեն համաձայնեցրել եք հաճախորդի հետ</span>
                </button>
              </div>
              <label v-if="form.pricingMode === 'FIXED'" class="ops__price-input">
                Համաձայնեցված գինը*
                <span class="ops__amd">
                  <input
                    v-model="form.quotedPriceAmd"
                    type="number"
                    min="0"
                    step="500"
                    inputmode="numeric"
                    placeholder="օր.՝ 15000"
                    required
                    :class="{ 'is-invalid': triedSubmit && priceMissing }"
                    :aria-invalid="triedSubmit && priceMissing"
                  />
                  <em>֏</em>
                </span>
                <small v-if="triedSubmit && priceMissing" class="ops__field-error">Պարտադիր է՝ գրեք համաձայնեցված գինը</small>
              </label>
            </fieldset>
            <label>Ներքին նշում (վարորդը չի տեսնում)<textarea v-model="form.internalNote" rows="2" /></label>
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
              <tr v-for="order in orders" :key="order.id" class="ops__row" @click="navigateTo(`/admin/orders/${order.id}`)">
                <td><NuxtLink :to="`/admin/orders/${order.id}`">{{ order.number }}</NuxtLink></td>
                <td>
                  <AppBadge :variant="ORDER_STATUS_VARIANT[order.status]">{{ ORDER_STATUS_LABEL[order.status] }}</AppBadge>
                  <div v-if="order.attentionKind" class="ops__muted">{{ ATTENTION_LABEL[order.attentionKind] }}</div>
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
  &__pricing {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
    min-width: 0;

    legend {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      padding: 0;
      margin-bottom: 4px;
    }
  }
  &__price-modes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-2);
  }
  &__price-mode {
    display: grid;
    gap: 2px;
    text-align: left;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    border: 1.5px solid var(--color-border);
    background: var(--color-surface);
    cursor: pointer;
    font: inherit;
    color: var(--color-text);
    transition: border-color 0.15s, background-color 0.15s;

    span {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      line-height: 1.35;
    }
    &:hover {
      border-color: var(--color-text-muted);
    }
    &.on {
      border-color: var(--color-primary, #14304f);
      background: var(--color-primary-bg, #e8eef6);
      box-shadow: inset 0 0 0 1px var(--color-primary, #14304f);
    }
  }
  &__price-input {
    max-width: 260px;

    .is-invalid {
      border-color: var(--color-danger, #d64545) !important;
      box-shadow: 0 0 0 3px var(--color-danger-bg, #fdecec);
    }
  }
  &__field-error {
    color: var(--color-danger, #d64545);
    font-size: 0.8rem;
  }
  &__amd {
    position: relative;
    display: block;

    input {
      width: 100%;
      padding-right: 32px !important;
    }
    em {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-style: normal;
      color: var(--color-text-secondary);
    }
  }
  &__form {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    display: grid;
    gap: var(--space-3);
    label {
      display: grid;
      gap: 4px;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    input,
    textarea,
    select {
      padding: 6px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font: inherit;
    }
    .row {
      display: grid;
      gap: var(--space-3);
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
  }
  &__hint {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    margin: 0;
  }
  &__chip {
    justify-self: start;
    border: 1px dashed var(--color-border);
    background: none;
    border-radius: var(--radius-full);
    padding: 2px 10px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  &__tri {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
  }
  &__tri-row {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
    span {
      min-width: 190px;
    }
  }
  &__radio {
    display: inline-flex !important;
    gap: 4px;
    align-items: center;
    grid-auto-flow: column;
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
