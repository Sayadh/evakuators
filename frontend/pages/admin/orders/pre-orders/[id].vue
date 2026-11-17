<script setup lang="ts">
/**
 * One pre-order (2026-11-17): the job, how many drivers were told, and every
 * price — cheapest first. From here the operator calls a driver, or turns the
 * pre-order into a real order at that driver's price and offers it to him
 * (backend `convertPreOrder`: the order is created even if the offer is
 * refused — then it is sent from the order page). Converting does NOT close
 * it: if that driver declines, «Պատվեր տալ» on the next one makes a second
 * order. Only «Փակել» closes it. Drivers never see each other's prices.
 */
import { computed, onMounted, ref } from 'vue'
import { useOpsRealtime } from '~/composables/useOpsRealtime'
import { vehicleTypeLabel } from '~/constants/vehicles'
import { newIdempotencyKey, opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import type { OpsPreOrderBid, OpsPreOrderDetail } from '~/types/opsDispatch'
import { formatDistance } from '~/utils/formatDistance'
import { formatClockTime, formatDateNumeric } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { apiErrorText, ERROR_LABEL, OFFER_STATUS_LABEL, ORDER_STATUS_LABEL } from '~/utils/opsDispatchLabels'
import { armenianPhone } from '~/utils/orderForm'
import { preOrderRequirementChips, preOrderStateLabel, preOrderVehicle } from '~/utils/preOrders'

const route = useRoute()
const id = computed(() => Number(route.params.id))
const detail = ref<OpsPreOrderDetail | null>(null)
const error = ref<string | null>(null)
const actionError = ref<string | null>(null)
const busy = ref(false)
const dispatchEnabled = useDispatchEnabled()
/** «Կրկին ծանուցել»: one key per press, reused on a retry of that press */
let notifyKey: string | null = null
const notifiedNote = ref<string | null>(null)

/** The driver being converted to, and the phone to use when none was stored */
const chosen = ref<OpsPreOrderBid | null>(null)
const phone = ref('')
const phoneError = ref<string | undefined>(undefined)
/** The «Պատվեր տալ» dialog, open while a driver is chosen */
const convertOpen = computed({
  get: () => chosen.value !== null,
  set: (value: boolean) => {
    if (!value && !busy.value) chosen.value = null
  },
})
let convertKey: string | null = null
/** Converted, but the offer to the driver was refused */
const notOffered = ref<{ orderId: number; why: string } | null>(null)

const pre = computed(() => detail.value?.preOrder ?? null)
const canConvert = computed(() => pre.value !== null)
/** Drivers this pre-order was already given to */
const givenTo = computed(() => new Set(detail.value?.orders.map((o) => o.driverId) ?? []))

async function load() {
  error.value = null
  try {
    detail.value = await opsDispatchRepository.preOrder(id.value)
  } catch (e) {
    error.value = apiErrorText(e, 'Նախապատվերը բեռնել չհաջողվեց։')
  }
}

/** How the offer to that driver went, as a badge colour */
function offerTone(status: string): 'success' | 'danger' | 'accent' | 'neutral' {
  if (status === 'ACCEPTED') return 'success'
  if (status === 'REJECTED' || status === 'EXPIRED') return 'danger'
  if (status === 'PENDING') return 'accent'
  return 'neutral'
}

function when(iso: string): string {
  return `${formatDateNumeric(iso)} ${formatClockTime(new Date(iso))}`
}

function startConvert(bid: OpsPreOrderBid) {
  chosen.value = bid
  phone.value = pre.value?.customer.phone ?? ''
  phoneError.value = undefined
  actionError.value = null
  convertKey = null
}

async function convert() {
  if (!chosen.value || !pre.value) return
  const customerPhone = armenianPhone(phone.value)
  if (!customerPhone) {
    phoneError.value = 'Գրեք հաճախորդի հեռախոսը +374XXXXXXXX կամ 0XXXXXXXX ձևով'
    return
  }
  phoneError.value = undefined
  busy.value = true
  actionError.value = null
  convertKey ??= newIdempotencyKey()
  try {
    const result = await opsDispatchRepository.convertPreOrder(pre.value.id, { driverId: chosen.value.driverId, customerPhone }, convertKey)
    convertKey = null
    if (result.offered) {
      await navigateTo(`/admin/orders/${result.orderId}`)
      return
    }
    // The order exists; the operator sends it from its page
    const why = result.offerError ? (ERROR_LABEL[result.offerError] ?? result.offerError) : ''
    notOffered.value = { orderId: result.orderId, why }
    chosen.value = null
    await load()
  } catch (e) {
    actionError.value = apiErrorText(e, 'Պատվեր ստեղծել չհաջողվեց։')
    chosen.value = null
    await load()
  } finally {
    busy.value = false
  }
}

async function notifyAgain() {
  if (!pre.value) return
  const ok = await confirmDialog({
    title: 'Կրկին ծանուցե՞լ վարորդներին',
    message: `Բոլոր ակտիվ վարորդները կստանան push՝ «Նախապատվեր #${pre.value.id}՝ խնդրում ենք նայել»։`,
    confirmLabel: 'Ծանուցել',
    cancelLabel: 'Ոչ',
  })
  if (!ok) return
  busy.value = true
  actionError.value = null
  notifyKey ??= newIdempotencyKey()
  try {
    const result = await opsDispatchRepository.notifyPreOrder(pre.value.id, notifyKey)
    notifyKey = null
    notifiedNote.value = `Ծանուցումն ուղարկվեց ${result.notified} վարորդի։`
    await load()
  } catch (e) {
    actionError.value = apiErrorText(e, 'Ծանուցել չհաջողվեց։')
  } finally {
    busy.value = false
  }
}

async function close() {
  if (!pre.value) return
  const ok = await confirmDialog({
    title: `Փակե՞լ նախապատվեր #${pre.value.id}-ը`,
    message: 'Վարորդներն այլևս գին գրել կամ փոխել չեն կարողանա։ Արդեն ստեղծված պատվերները չեն փոխվի։',
    confirmLabel: 'Փակել',
    cancelLabel: 'Ոչ',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  actionError.value = null
  try {
    await opsDispatchRepository.closePreOrder(pre.value.id)
    await load()
  } catch (e) {
    actionError.value = apiErrorText(e, 'Փակել չհաջողվեց։')
  } finally {
    busy.value = false
  }
}

useOpsRealtime(
  (event) => {
    if (event.event.startsWith('pre-order.') && Number(event.data.preOrderId) === id.value) void load()
  },
  () => void load(),
)
onMounted(load)
useSeoMetaData({ title: 'Նախապատվեր', description: 'Նախապատվեր', path: '/admin/orders/pre-orders', noindex: true })
</script>

<template>
  <div class="container pre-order">
    <OpsNav />
    <div>
      <AppButton to="/admin/orders/pre-orders" variant="ghost" size="sm">← Բոլոր նախապատվերները</AppButton>
    </div>
    <p v-if="error" class="pre-order__error" role="alert">{{ error }}</p>

    <template v-if="pre && detail">
      <div class="pre-order__head">
        <h1>Նախապատվեր #{{ pre.id }}</h1>
        <AppBadge :variant="preOrderStateLabel(pre).tone">{{ preOrderStateLabel(pre).text }}</AppBadge>
        <span class="pre-order__spacer" />
        <AppButton v-if="pre.status === 'OPEN'" variant="outline" size="sm" :disabled="busy || dispatchEnabled === false" @click="notifyAgain">
          <AppIcon name="alert" :size="16" /> Կրկին ծանուցել վարորդներին
        </AppButton>
        <AppButton v-if="pre.status === 'OPEN'" variant="danger" size="sm" :disabled="busy" @click="close">Փակել նախապատվերը</AppButton>
      </div>

      <section class="box">
        <dl>
          <dt>Որտեղից</dt>
          <dd>
            {{ pre.pickup.address }}
            <small v-if="pre.pickup.latitude !== null">
              ({{ pre.pickup.latitude }}, {{ pre.pickup.longitude }} · {{ pre.pickup.precision === 'EXACT' ? 'հաստատված' : 'մոտավոր' }})
            </small>
          </dd>
          <template v-if="pre.destination">
            <dt>Ուր</dt>
            <dd>{{ pre.destination.address }}</dd>
          </template>
          <template v-if="preOrderVehicle(pre)">
            <dt>Մեքենա</dt>
            <dd>{{ preOrderVehicle(pre) }}</dd>
          </template>
          <template v-if="preOrderRequirementChips(pre).length">
            <dt>Վիճակ</dt>
            <dd>
              <AppBadge v-for="chip in preOrderRequirementChips(pre)" :key="chip" class="pre-order__chip">{{ chip }}</AppBadge>
            </dd>
          </template>
          <template v-if="pre.comment">
            <dt>Մեկնաբանություն</dt>
            <dd class="pre">{{ pre.comment }}</dd>
          </template>
          <dt>Հաճախորդ</dt>
          <dd>
            <template v-if="pre.customer.phone">
              <a :href="`tel:${pre.customer.phone}`">{{ pre.customer.phone }}</a>
              <span v-if="pre.customer.name"> · {{ pre.customer.name }}</span>
            </template>
            <span v-else class="muted">նշված չէ</span>
          </dd>
          <template v-if="pre.internalNote">
            <dt>Ներքին նշում</dt>
            <dd class="pre">{{ pre.internalNote }}</dd>
          </template>
          <dt>Ստեղծվել է</dt>
          <dd>
            {{ when(pre.createdAt) }}
            </dd>
          <dt>Ծանուցվել է</dt>
          <dd>
            {{ detail.recipients }} վարորդ<template v-if="pre.notify.rounds > 1"> · {{ pre.notify.rounds }} անգամ</template>
            <template v-if="pre.notify.at"> · վերջինը՝ {{ when(pre.notify.at) }}</template>
          </dd>
        </dl>
      </section>

      <p v-if="dispatchEnabled === false" class="pre-order__error" role="alert">
        Ավտոմատ բաշխումն անջատված է (LIVE_DISPATCH_ENABLED)․ ծանուցել կամ պատվեր տալ հնարավոր չէ։
      </p>
      <p v-if="notifiedNote" class="pre-order__ok" role="status">{{ notifiedNote }}</p>
      <p v-if="actionError" class="pre-order__error" role="alert">{{ actionError }}</p>
      <p v-if="notOffered" class="pre-order__error" role="alert">
        Պատվեր #{{ notOffered.orderId }} ստեղծվեց, բայց վարորդին ուղարկել չհաջողվեց<template v-if="notOffered.why">՝ {{ notOffered.why }}</template>։
        <AppButton :to="`/admin/orders/${notOffered.orderId}`" size="sm" variant="outline">Ուղարկել պատվերի էջից →</AppButton>
      </p>

      <section v-if="detail.orders.length" class="box">
        <h2>Ստեղծված պատվերներ ({{ detail.orders.length }})</h2>
        <ul class="conversions">
          <li v-for="o in detail.orders" :key="o.orderId">
            <NuxtLink :to="`/admin/orders/${o.orderId}`">№ {{ o.number }}</NuxtLink>
            <span>{{ o.driverName ?? `#${o.driverId}` }} · {{ formatPrice(o.priceAmd) }}</span>
            <AppBadge>{{ ORDER_STATUS_LABEL[o.status] ?? o.status }}</AppBadge>
            <AppBadge v-if="o.offerStatus" :variant="offerTone(o.offerStatus)">առաջարկ՝ {{ OFFER_STATUS_LABEL[o.offerStatus] ?? o.offerStatus }}</AppBadge>
            <span class="muted">{{ when(o.createdAt) }}</span>
          </li>
        </ul>
      </section>

      <section class="box">
        <h2>Գներ ({{ detail.bids.length }})</h2>
        <p v-if="detail.bids.length === 0" class="muted">Դեռ ոչ մի վարորդ գին չի գրել։</p>
        <table v-else class="bids">
          <thead>
            <tr>
              <th>Գին</th>
              <th>Վարորդ</th>
              <th>Մեքենա</th>
              <th>Հեռավորություն</th>
              <th>Գնահատական</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(bid, i) in detail.bids" :key="bid.driverId" :class="{ best: i === 0 }">
              <td class="price">{{ formatPrice(bid.priceAmd) }}</td>
              <td>
                {{ bid.name ?? `#${bid.driverId}` }}
                <span class="bids__flags">
                  <AppBadge v-if="bid.busy" variant="accent">պատվերի վրա է</AppBadge>
                  <AppBadge v-if="givenTo.has(bid.driverId)" variant="primary">պատվեր տրվել է</AppBadge>
                </span>
                <small class="muted">{{ when(bid.updatedAt) }}</small>
              </td>
              <td>{{ vehicleTypeLabel(bid.vehicleType) }}<template v-if="bid.capacityTons"> · {{ bid.capacityTons }} տ</template></td>
              <td>{{ bid.distanceMeters === null ? '—' : formatDistance(bid.distanceMeters) }}</td>
              <td>{{ bid.rating ? `★ ${bid.rating.average} (${bid.rating.count})` : '—' }}</td>
              <td class="actions">
                <AppButton v-if="bid.phone" :href="`tel:${bid.phone}`" size="sm" variant="outline">
                  <AppIcon name="phone" :size="16" /> {{ bid.phone }}
                </AppButton>
                <AppButton v-if="canConvert" size="sm" variant="success" :disabled="busy || dispatchEnabled === false" @click="startConvert(bid)">Պատվեր տալ</AppButton>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <AppModal v-model="convertOpen" :title="chosen ? `Պատվեր՝ ${chosen.name ?? `#${chosen.driverId}`}-ին` : ''">
        <div v-if="chosen" class="convert">
          <p class="convert__price">{{ formatPrice(chosen.priceAmd) }} <small>ֆիքսված գին</small></p>
          <p class="convert__text">
            Կստեղծվի պատվեր այս տվյալներով և կուղարկվի միայն այս վարորդին։ Հաճախորդի հեռախոսը նա կտեսնի ընդունելուց հետո։ Նախապատվերը բաց կմնա․ եթե վարորդը
            մերժի, կարող եք տալ հաջորդին։
          </p>
          <AppInput v-model="phone" type="tel" label="Հաճախորդի հեռախոս" placeholder="+374 91 00 00 01" required :error="phoneError" autocomplete="off" />
          <div class="convert__actions">
            <AppButton variant="outline" :disabled="busy" @click="chosen = null">Չեղարկել</AppButton>
            <AppButton variant="success" :disabled="busy" @click="convert">{{ busy ? 'Ստեղծվում է…' : 'Ստեղծել և ուղարկել' }}</AppButton>
          </div>
        </div>
      </AppModal>
    </template>
  </div>
</template>

<style scoped lang="scss">
.pre-order {
  display: grid;
  gap: var(--space-3);
  padding-bottom: var(--space-6);
}
.pre-order__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  h1 {
    margin: 0;
  }
}
.pre-order__ok {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-success-bg, #e8f6ee);
}
.pre-order__error {
  margin: 0;
  color: var(--color-danger, #b42318);
}
.box {
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.05rem;
  }
}
dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px var(--space-4);
  margin: 0;
}
dt {
  color: var(--color-text-secondary);
}
dd {
  margin: 0;
}
.pre {
  white-space: pre-line;
}
.pre-order__chip {
  margin: 0 6px 4px 0;
}
.pre-order__spacer {
  flex: 1;
}
.muted {
  color: var(--color-text-muted);
}
.bids {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  th,
  td {
    text-align: left;
    padding: 8px 6px;
    border-bottom: 1px solid var(--color-border);
    vertical-align: top;
  }
  th {
    color: var(--color-text-secondary);
    font-weight: 500;
  }
  small {
    display: block;
  }
  .price {
    font-weight: 700;
    white-space: nowrap;
  }
  tr.best .price {
    color: #116b3a;
  }
  .bids__flags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
  }
}
@media (max-width: 720px) {
  .bids thead {
    display: none;
  }
  .bids tr {
    display: grid;
    gap: 2px;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .bids td {
    border: 0;
    padding: 2px 0;
  }
  .bids .actions {
    justify-content: flex-start;
  }
}
.conversions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    font-size: 0.9rem;
  }
}
.convert {
  display: grid;
  gap: var(--space-3);
}
.convert__price {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--color-success, #116b3a);
  small {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--color-text-muted);
  }
}
.convert__text {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
.convert__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
