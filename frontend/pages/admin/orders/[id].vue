<script setup lang="ts">
/**
 * One order: details, live state, every operator action, offers history,
 * the current attempt's ranked candidates and the full audit timeline.
 *
 * Every action sends the order's `version` (optimistic concurrency) and an
 * Idempotency-Key created when the button is pressed; on VERSION_CONFLICT the
 * page re-reads and says so instead of silently overwriting someone else.
 * Buttons are shown by STATUS, but the server is the authority — a refused
 * action shows the server's reason.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import OpsDriverMap from '~/components/ops/OpsDriverMap.vue'
import { newIdempotencyKey, opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { useOpsRealtime } from '~/composables/useOpsRealtime'
import type { CancelReason, OpsMapDriver, OpsOrderDetail, PaymentStatus, ProgressAction } from '~/types/opsDispatch'
import { formatClockTime, formatDateNumeric } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import {
  ATTENTION_LABEL,
  CANCEL_REASON_LABEL,
  OFFER_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_VARIANT,
  PAYMENT_LABEL,
  REASON_LABEL,
  SEARCH_FAILURE_KINDS,
  apiErrorCode,
  apiErrorText,
  availabilitySummary,
  formatAge,
  formatArmenianPhone,
  formatMeters,
  formatSeconds,
} from '~/utils/opsDispatchLabels'

const route = useRoute()
const orderId = Number(route.params.id)
const adminAuth = useAdminAuthStore()

const detail = ref<OpsOrderDetail | null>(null)
const drivers = ref<OpsMapDriver[]>([])
const gpsMaxAgeSeconds = ref(120)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)
const now = ref(Date.now())

const order = computed(() => detail.value?.order ?? null)
const pendingOffer = computed(() => detail.value?.offers.find((o) => o.status === 'PENDING') ?? null)
const assignedDriver = computed(() => drivers.value.find((d) => d.towTruckId === order.value?.assignedTowTruckId) ?? null)
const searchFailed = computed(() => !!order.value?.attentionKind && SEARCH_FAILURE_KINDS.includes(order.value.attentionKind))
const driverAttached = computed(() => order.value?.assignedTowTruckId != null)

async function load() {
  try {
    detail.value = await opsDispatchRepository.getOrder(orderId)
    const map = await opsDispatchRepository.driverMap({})
    drivers.value = map.items
    gpsMaxAgeSeconds.value = map.gpsMaxAgeSeconds
  } catch (e) {
    error.value = apiErrorText(e, 'Պատվերը բեռնել չհաջողվեց։')
  }
}

// One key per pressed button: a retry of the SAME press reuses it.
const pendingKeys = new Map<string, string>()
function keyFor(action: string): string {
  if (!pendingKeys.has(action)) pendingKeys.set(action, newIdempotencyKey())
  return pendingKeys.get(action)!
}

async function run(action: string, fn: (key: string, version: number) => Promise<unknown>, success: string) {
  if (!order.value) return
  error.value = null
  notice.value = null
  busy.value = true
  try {
    await fn(keyFor(action), order.value.version)
    pendingKeys.delete(action)
    notice.value = success
  } catch (e) {
    const code = apiErrorCode(e)
    // A definitive server answer: the next press is a NEW attempt.
    if (code) pendingKeys.delete(action)
    error.value = apiErrorText(e, 'Գործողությունը չհաջողվեց։')
  } finally {
    busy.value = false
    await load()
  }
}

const start = () => run('start', (k, v) => opsDispatchRepository.action(orderId, 'start', { expectedVersion: v }, k), 'Ավտոմատ որոնումը սկսվեց։')
const stop = () => run('stop', (k, v) => opsDispatchRepository.action(orderId, 'stop', { expectedVersion: v }, k), 'Որոնումը դադարեցվեց։')
const progress = (a: ProgressAction) => run(`progress-${a}`, (k, v) => opsDispatchRepository.progress(orderId, a, v, k), 'Կարգավիճակը թարմացվեց (վարորդի անունից)։')

const agreedPrice = ref('')
const confirmPrice = () =>
  run('confirm-price', (k, v) => opsDispatchRepository.action(orderId, 'confirm-price', { agreedPriceAmd: Number(agreedPrice.value), expectedVersion: v }, k), 'Գինը հաստատվեց։')

const paymentStatus = ref<PaymentStatus>('UNKNOWN')
const setPayment = () => run('payment', (k, v) => opsDispatchRepository.action(orderId, 'payment', { status: paymentStatus.value, expectedVersion: v }, k), 'Վճարման կարգավիճակը պահպանվեց։')

const cancelReason = ref<CancelReason>('CUSTOMER_DECLINED')
const cancelComment = ref('')
const cancel = () => {
  if (!confirm('Չեղարկե՞լ պատվերը։ Վարորդը (եթե կա) կստանա ծանուցում։')) return
  return run('cancel', (k, v) => opsDispatchRepository.action(orderId, 'cancel', { reason: cancelReason.value, comment: cancelComment.value || null, expectedVersion: v }, k), 'Պատվերը չեղարկվեց։')
}

const releaseReason = ref('')
const releaseRestart = ref(true)
const release = () => {
  if (!confirm('Հաստատում եք, որ նախորդ վարորդի նշանակումն ավարտված է (խոսել եք նրա հետ)։')) return
  return run(
    'release',
    (k, v) => opsDispatchRepository.action(orderId, 'release', { confirm: true, reason: releaseReason.value, restartSearch: releaseRestart.value, expectedVersion: v }, k),
    releaseRestart.value ? 'Նշանակումը հանվեց, նոր որոնումը սկսվեց։' : 'Նշանակումը հանվեց։',
  )
}
const resumeNote = ref('')
const resume = () => run('resume', (k, v) => opsDispatchRepository.action(orderId, 'resume', { note: resumeNote.value, expectedVersion: v }, k), 'Պատվերը շարունակվում է նույն վարորդով։')
const overrideNote = ref('')
const override = () =>
  run('override', (k, v) => opsDispatchRepository.action(orderId, 'override-requirements', { note: overrideNote.value, expectedVersion: v }, k), 'Անհայտ պահանջներն ընդունվեցին (audit-ում գրանցված)։')

const manualDriver = ref<number | null>(null)
const manualOverride = ref('')
const manualCandidate = computed(() => drivers.value.find((d) => d.towTruckId === manualDriver.value) ?? null)
const manualOffer = () =>
  run(
    'manual-offer',
    (k, v) => opsDispatchRepository.manualOffer(orderId, { towTruckId: manualDriver.value!, overrideReason: manualOverride.value || null, expectedVersion: v }, k),
    'Առաջարկն ուղարկվեց ընտրված վարորդին։',
  )

const routeMeters = ref('')
const routeMinutes = ref('')
async function computeRoute() {
  const result = await opsDispatchRepository.computeRoute(orderId).catch((e) => ({ computed: false, reason: apiErrorText(e, 'սխալ') }))
  notice.value = result.computed ? 'Երթուղին հաշվարկվեց։' : `Չհաշվարկվեց (${result.reason})։ Կարող եք մուտքագրել ձեռքով։`
  await load()
}
async function saveManualRoute() {
  await opsDispatchRepository.manualRoute(orderId, Number(routeMeters.value) * 1000, routeMinutes.value ? Number(routeMinutes.value) * 60 : null)
  notice.value = 'Ձեռքով մուտքագրված հեռավորությունը պահպանվեց (նշված է որպես ձեռքով)։'
  await load()
}

const { connected } = useOpsRealtime(
  (event) => {
    if (Number(event.data.orderId) === orderId) void load()
  },
  () => void load(),
)

let tick: ReturnType<typeof setInterval> | null = null
let poll: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  adminAuth.init()
  void load()
  tick = setInterval(() => (now.value = Date.now()), 1000)
  poll = setInterval(() => void load(), 15_000)
})
onUnmounted(() => {
  if (tick) clearInterval(tick)
  if (poll) clearInterval(poll)
})

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now.value) / 1000))
}
function when(iso: string | null | undefined): string {
  return iso ? `${formatDateNumeric(iso)} ${formatClockTime(new Date(iso))}` : '—'
}
function tri(value: boolean | null): string {
  return value === null ? 'անհայտ' : value ? 'այո' : 'ոչ'
}

useSeoMetaData({ title: `Պատվեր #${orderId}`, description: 'Պատվերի մանրամասներ', path: `/admin/orders/${orderId}`, noindex: true })
</script>

<template>
  <div class="container order">
    <header class="order__header">
      <NuxtLink to="/admin/orders" class="order__back">← Պատվերներ</NuxtLink>
      <span class="order__live" :class="{ on: connected }">{{ connected ? 'Կենդանի' : 'Թարմացվում է 15 վ-ը մեկ' }}</span>
    </header>
    <p v-if="error" class="order__error" role="alert">{{ error }}</p>
    <p v-if="notice" class="order__notice" role="status">{{ notice }}</p>

    <template v-if="order && detail">
      <div class="order__title">
        <h1>{{ order.number }}</h1>
        <AppBadge :variant="ORDER_STATUS_VARIANT[order.status]">{{ ORDER_STATUS_LABEL[order.status] }}</AppBadge>
        <span v-if="order.attentionKind" class="order__attention">{{ ATTENTION_LABEL[order.attentionKind] }}</span>
      </div>

      <div class="order__grid">
        <section class="card">
          <h2>Պատվեր</h2>
          <dl>
            <dt>Հաճախորդ</dt>
            <dd><a :href="`tel:${order.customer.phone}`">{{ formatArmenianPhone(order.customer.phone) }}</a> {{ order.customer.name }}</dd>
            <dt>Pickup</dt>
            <dd>{{ order.pickup.address }} · <a :href="`https://maps.google.com/?q=${order.pickup.latitude},${order.pickup.longitude}`" target="_blank" rel="noopener">քարտեզ</a></dd>
            <dt>Destination</dt>
            <dd>
              <template v-if="order.destination">{{ order.destination.address }} · <a :href="`https://maps.google.com/?q=${order.destination.latitude},${order.destination.longitude}`" target="_blank" rel="noopener">քարտեզ</a></template>
              <template v-else>հայտնի չէ</template>
            </dd>
            <dt>Pickup → destination</dt>
            <dd>
              <template v-if="order.pickupToDestination?.meters">
                {{ formatMeters(order.pickupToDestination.meters) }}, {{ formatSeconds(order.pickupToDestination.seconds) }}
                <span class="muted">{{ order.pickupToDestination.manual ? '(ձեռքով մուտքագրված)' : '(մոտավոր, սովորական մեքենայի երթուղի)' }}</span>
              </template>
              <template v-else-if="order.destination">
                <button type="button" class="link" @click="computeRoute">Հաշվարկել</button>
                <span class="manual-route">
                  <input v-model="routeMeters" type="number" min="0.1" step="0.1" placeholder="կմ" />
                  <input v-model="routeMinutes" type="number" min="1" placeholder="րոպե" />
                  <button type="button" class="link" :disabled="!routeMeters" @click="saveManualRoute">Պահել ձեռքով</button>
                </span>
              </template>
              <template v-else>—</template>
            </dd>
            <dt>Մեքենա</dt>
            <dd>{{ [order.vehicle.make, order.vehicle.model, order.vehicle.plate].filter(Boolean).join(' ') || '—' }} · {{ order.vehicle.weightKg ? `${order.vehicle.weightKg} կգ` : 'քաշը անհայտ' }}</dd>
            <dt>Խնդիր</dt>
            <dd>{{ order.problemDescription || '—' }}</dd>
            <dt>Պահանջներ</dt>
            <dd>
              Անիվները պտտվում են՝ {{ tri(order.requirements.wheelsRoll) }} · Ղեկ արգելափակված՝ {{ tri(order.requirements.steeringLocked) }} ·
              Տուփ արգելափակված՝ {{ tri(order.requirements.gearboxLocked) }} · Մանիպուլյատոր՝ {{ tri(order.requirements.needsManipulator) }}
              <div v-if="order.requirements.overridden" class="muted">Override՝ «{{ order.requirements.overrideNote }}»</div>
            </dd>
            <dt>Գին</dt>
            <dd>
              <template v-if="order.price.mode === 'FIXED'">Ֆիքսված՝ {{ order.price.quotedAmd !== null ? formatPrice(order.price.quotedAmd) : '—' }}</template>
              <template v-else>
                Համաձայնեցվող՝
                <template v-if="order.price.confirmed">{{ formatPrice(order.price.agreedAmd ?? 0) }} (հաստատված {{ when(order.price.confirmedAt) }})</template>
                <strong v-else>դեռ չի հաստատված — տեղափոխումը փակ է</strong>
              </template>
            </dd>
            <dt>Վճարում</dt>
            <dd>{{ PAYMENT_LABEL[order.payment.status] }}</dd>
            <dt v-if="order.internalNote">Ներքին նշում</dt>
            <dd v-if="order.internalNote">{{ order.internalNote }}</dd>
          </dl>
        </section>

        <section class="card">
          <h2>Գործողություններ</h2>

          <div v-if="pendingOffer" class="box">
            Առաջարկ #{{ pendingOffer.towTruckId }} վարորդին — մնաց <strong>{{ secondsLeft(pendingOffer.expiresAt) }} վ</strong>
            <span v-if="pendingOffer.etaSeconds" class="muted">· մոտ {{ formatSeconds(pendingOffer.etaSeconds) }}</span>
          </div>

          <div v-if="driverAttached && assignedDriver" class="box">
            Վարորդ՝ <strong>{{ assignedDriver.driverName }}</strong>
            <a :href="`tel:${assignedDriver.phone}`">{{ formatArmenianPhone(assignedDriver.phone) }}</a>
            <div class="muted">
              {{ availabilitySummary(assignedDriver.availability).text }} · GPS {{ formatAge(assignedDriver.availability.gpsAgeSeconds) }}
              <template v-if="assignedDriver.position?.accuracyM"> · ±{{ Math.round(assignedDriver.position.accuracyM) }} մ</template>
            </div>
          </div>

          <div class="actions">
            <AppButton v-if="order.status === 'DRAFT' || (order.status === 'NEEDS_ATTENTION' && searchFailed)" :disabled="busy" @click="start">Սկսել ավտոմատ որոնումը</AppButton>
            <AppButton v-if="order.status === 'SEARCHING'" variant="outline" :disabled="busy" @click="stop">Դադարեցնել որոնումը</AppButton>
          </div>

          <div v-if="order.status === 'PRICE_CONFIRMATION_PENDING' || (order.price.mode === 'NEGOTIATION_REQUIRED' && !order.price.confirmed && driverAttached)" class="box">
            <label>Համաձայնեցված գինը (֏) <input v-model="agreedPrice" type="number" min="0" step="500" /></label>
            <AppButton size="sm" :disabled="busy || !agreedPrice" @click="confirmPrice">Հաստատել գինը</AppButton>
          </div>

          <div v-if="driverAttached && order.status !== 'NEEDS_ATTENTION'" class="actions">
            <span class="muted">Վարորդի անունից (եթե զանգել է)՝</span>
            <AppButton v-if="['ASSIGNED', 'PRICE_CONFIRMATION_PENDING'].includes(order.status)" size="sm" variant="ghost" :disabled="busy" @click="progress('EN_ROUTE')">Ճանապարհին</AppButton>
            <AppButton v-if="['ASSIGNED', 'PRICE_CONFIRMATION_PENDING', 'EN_ROUTE_TO_PICKUP'].includes(order.status)" size="sm" variant="ghost" :disabled="busy" @click="progress('ARRIVED')">Տեղում է</AppButton>
            <AppButton v-if="order.status === 'ARRIVED_AT_PICKUP'" size="sm" variant="ghost" :disabled="busy" @click="progress('START_TRANSPORT')">Տեղափոխումը սկսվեց</AppButton>
            <AppButton v-if="order.status === 'TRANSPORTING'" size="sm" variant="success" :disabled="busy" @click="progress('COMPLETE')">Ավարտված</AppButton>
          </div>

          <div v-if="order.status === 'NEEDS_ATTENTION' && driverAttached" class="box box--warn">
            <p>Վարորդը դեռ նշանակված է։ Երկրորդ մեքենա ավտոմատ չի ուղարկվում։</p>
            <label>Մեկնաբանություն <input v-model="resumeNote" /></label>
            <AppButton size="sm" variant="outline" :disabled="busy" @click="resume">Շարունակել նույն վարորդով</AppButton>
          </div>

          <div v-if="driverAttached && order.status !== 'TRANSPORTING'" class="box">
            <label>Նշանակումը հանելու պատճառ <input v-model="releaseReason" minlength="3" /></label>
            <label class="inline"><input v-model="releaseRestart" type="checkbox" /> Անմիջապես սկսել նոր որոնում</label>
            <AppButton size="sm" variant="danger" :disabled="busy || releaseReason.trim().length < 3" @click="release">Հանել նշանակումը</AppButton>
          </div>

          <div v-if="order.status === 'DRAFT' || order.status === 'NEEDS_ATTENTION'" class="box">
            <label>Անհայտ պահանջների override (պատճառ) <input v-model="overrideNote" /></label>
            <AppButton size="sm" variant="outline" :disabled="busy || overrideNote.trim().length < 5" @click="override">Ընդունել անհայտը</AppButton>
          </div>

          <div v-if="!driverAttached && !pendingOffer && ['DRAFT', 'SEARCHING', 'NEEDS_ATTENTION'].includes(order.status)" class="box">
            <label>
              Ձեռքով առաջարկ վարորդին
              <select v-model="manualDriver">
                <option :value="null">— ընտրեք —</option>
                <option v-for="d in drivers" :key="d.towTruckId" :value="d.towTruckId" :disabled="!d.manualOverridable">
                  {{ d.driverName }} — {{ availabilitySummary(d.availability).text }}
                </option>
              </select>
            </label>
            <template v-if="manualCandidate && !manualCandidate.availability.eligible">
              <p class="muted">Պատճառներ՝ {{ manualCandidate.availability.reasons.map((r) => REASON_LABEL[r] ?? r).join(', ') }}</p>
              <label>Ինչու՞ եք շրջանցում (կգրանցվի audit-ում) <input v-model="manualOverride" /></label>
            </template>
            <AppButton size="sm" :disabled="busy || !manualDriver" @click="manualOffer">Ուղարկել առաջարկ</AppButton>
          </div>

          <div v-if="order.status !== 'DRAFT'" class="box">
            <label>
              Վճարում
              <select v-model="paymentStatus">
                <option v-for="(label, key) in PAYMENT_LABEL" :key="key" :value="key">{{ label }}</option>
              </select>
            </label>
            <AppButton size="sm" variant="outline" :disabled="busy" @click="setPayment">Պահել</AppButton>
          </div>

          <div v-if="!['COMPLETED', 'CANCELLED'].includes(order.status)" class="box">
            <label>
              Չեղարկման պատճառ
              <select v-model="cancelReason">
                <option v-for="(label, key) in CANCEL_REASON_LABEL" :key="key" :value="key">{{ label }}</option>
              </select>
            </label>
            <label v-if="cancelReason === 'OTHER'">Մեկնաբանություն* <input v-model="cancelComment" /></label>
            <AppButton size="sm" variant="danger" :disabled="busy || (cancelReason === 'OTHER' && !cancelComment.trim())" @click="cancel">Չեղարկել պատվերը</AppButton>
          </div>
        </section>
      </div>

      <section class="card">
        <h2>Քարտեզ</h2>
        <OpsDriverMap :drivers="drivers" :gps-max-age-seconds="gpsMaxAgeSeconds" :pickup="order.pickup" :selected-id="order.assignedTowTruckId" />
      </section>

      <div class="order__grid">
        <section class="card">
          <h2>Առաջարկներ</h2>
          <table v-if="detail.offers.length" class="table">
            <thead><tr><th>Վարորդ</th><th>Վիճակ</th><th>ETA</th><th>Ստեղծվել</th><th>Պատասխան</th></tr></thead>
            <tbody>
              <tr v-for="offer in detail.offers" :key="offer.id">
                <td>#{{ offer.towTruckId }}<span v-if="offer.manual" class="muted"> (ձեռքով)</span></td>
                <td>{{ OFFER_STATUS_LABEL[offer.status] }}<span v-if="offer.closeReason" class="muted"> · {{ offer.closeReason }}</span></td>
                <td>{{ offer.etaSeconds ? formatSeconds(offer.etaSeconds) : 'ճանապարհ չի հաշվարկվել' }}</td>
                <td>{{ when(offer.createdAt) }}</td>
                <td>{{ when(offer.respondedAt) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted">Առաջարկներ դեռ չկան։</p>

          <h3>Վերջին որոնման թեկնածուներ</h3>
          <table v-if="detail.candidates.length" class="table">
            <thead><tr><th>#</th><th>Վարորդ</th><th>Ճանապարհով</th><th>Ուղիղ գծով</th><th>Վիճակ</th></tr></thead>
            <tbody>
              <tr v-for="c in detail.candidates" :key="c.towTruckId">
                <td>{{ c.rank >= 0 ? c.rank % 1000 + 1 : '—' }}</td>
                <td>{{ c.driverName }}</td>
                <td>{{ c.routeOk ? `${formatMeters(c.roadMeters)}, ${formatSeconds(c.etaSeconds)}` : `չհաշվարկվեց (${c.routeError ?? '—'})` }}</td>
                <td>{{ formatMeters(c.straightLineMeters) }}</td>
                <td>{{ c.status }}<span v-if="c.skipReason" class="muted"> · {{ c.skipReason }}</span></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="card">
          <h2>Timeline</h2>
          <ol class="timeline">
            <li v-for="event in [...detail.timeline].reverse()" :key="event.id">
              <span class="muted">{{ when(event.createdAt) }}</span>
              <strong>{{ event.type }}</strong>
              <span class="muted">{{ event.actorType }}{{ event.actorId ? ` #${event.actorId}` : '' }}</span>
              <code v-if="Object.keys(event.data ?? {}).length">{{ JSON.stringify(event.data) }}</code>
            </li>
          </ol>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.order {
  padding-top: var(--space-5);
  padding-bottom: var(--space-8);
  &__header {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  &__back {
    color: var(--color-text-secondary);
  }
  &__live {
    font-size: 0.8rem;
    color: var(--color-text-muted);
    &.on {
      color: var(--color-success);
    }
  }
  &__title {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    flex-wrap: wrap;
    h1 {
      margin: 0;
      font-size: 1.4rem;
    }
  }
  &__attention {
    color: var(--color-danger);
    font-weight: 600;
  }
  &__error {
    color: var(--color-danger);
  }
  &__notice {
    color: var(--color-success);
  }
  &__grid {
    display: grid;
    gap: var(--space-4);
    margin-top: var(--space-4);
    grid-template-columns: minmax(0, 1fr);
    @media (min-width: 1000px) {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
}
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-top: var(--space-4);
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.05rem;
  }
  h3 {
    font-size: 0.95rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px var(--space-3);
    margin: 0;
  }
  dt {
    color: var(--color-text-secondary);
  }
  dd {
    margin: 0;
  }
}
.box {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  margin-bottom: var(--space-3);
  display: grid;
  gap: var(--space-2);
  label {
    display: grid;
    gap: 4px;
    font-size: 0.85rem;
  }
  .inline {
    display: flex;
    align-items: center;
  }
  input,
  select {
    padding: 5px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  &--warn {
    background: var(--color-danger-bg);
  }
}
.actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: var(--space-3);
}
.muted {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.link {
  background: none;
  border: 0;
  color: var(--color-primary-light);
  cursor: pointer;
  text-decoration: underline;
}
.manual-route {
  display: inline-flex;
  gap: 4px;
  margin-left: var(--space-2);
  input {
    width: 70px;
  }
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th,
  td {
    text-align: left;
    padding: 6px;
    border-bottom: 1px solid var(--color-border);
  }
}
.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 520px;
  overflow-y: auto;
  li {
    display: grid;
    gap: 2px;
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border);
  }
  code {
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-text-secondary);
  }
}
</style>
