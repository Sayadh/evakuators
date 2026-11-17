<script setup lang="ts">
/**
 * Pre-orders (2026-11-17): describe a job without the customer's contact, let
 * every driver who can do it answer with a price, then pick one
 * (pre-orders/[id].vue). Same questions as an order — OrderFormFields with
 * variant="preOrder" — so the two forms never ask different things.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import OrderFormFields from '~/components/ops/OrderFormFields.vue'
import { useOpsRealtime } from '~/composables/useOpsRealtime'
import { newIdempotencyKey, opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import type { OpsPreOrderListItem } from '~/types/opsDispatch'
import { formatClockTime, formatDateNumeric } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { apiErrorText } from '~/utils/opsDispatchLabels'
import { blankOrderForm, buildPreOrderBody } from '~/utils/orderForm'
import { preOrderRequirementChips, preOrderStateLabel, preOrderVehicle } from '~/utils/preOrders'

const status = ref<'OPEN' | 'CLOSED'>('OPEN')
const dispatchEnabled = useDispatchEnabled()
const items = ref<OpsPreOrderListItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const showForm = ref(false)
const form = reactive(blankOrderForm())
const triedSubmit = ref(false)
const formError = ref<string | null>(null)
const saving = ref(false)
const createdNote = ref<string | null>(null)
/** One key per press of «Ուղարկել», reused if that same press is retried */
let createKey: string | null = null

async function load() {
  loading.value = true
  error.value = null
  try {
    items.value = await opsDispatchRepository.preOrders(status.value)
  } catch (e) {
    error.value = apiErrorText(e, 'Նախապատվերները բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
  }
}

async function submit() {
  triedSubmit.value = true
  formError.value = null
  const built = buildPreOrderBody(form)
  if (!built.ok) {
    formError.value = built.error
    return
  }
  saving.value = true
  createKey ??= newIdempotencyKey()
  try {
    const result = await opsDispatchRepository.createPreOrder(built.body, createKey)
    createKey = null
    Object.assign(form, blankOrderForm())
    triedSubmit.value = false
    showForm.value = false
    createdNote.value =
      result.recipients === 0
        ? `Նախապատվեր #${result.preOrder.id} ստեղծվեց, բայց ակտիվ վարորդ չկա — ծանուցում չի գնացել։`
        : `Նախապատվեր #${result.preOrder.id} ուղարկվեց բոլոր ${result.recipients} ակտիվ վարորդներին։`
    status.value = 'OPEN'
    await load()
  } catch (e) {
    formError.value = apiErrorText(e, 'Նախապատվերը ստեղծել չհաջողվեց։')
  } finally {
    saving.value = false
  }
}

function when(iso: string): string {
  return `${formatDateNumeric(iso)} ${formatClockTime(new Date(iso))}`
}

function setStatus(next: 'OPEN' | 'CLOSED') {
  if (status.value === next) return
  status.value = next
  void load()
}

const empty = computed(() => !loading.value && !error.value && items.value.length === 0)

useOpsRealtime(
  (event) => {
    if (event.event.startsWith('pre-order.')) void load()
  },
  () => void load(),
)
onMounted(load)
useSeoMetaData({ title: 'Նախապատվերներ', description: 'Նախապատվերներ', path: '/admin/orders/pre-orders', noindex: true })
</script>

<template>
  <div class="container pre-orders">
    <OpsNav />
    <div class="pre-orders__head">
      <h1>Նախապատվերներ</h1>
      <AppButton :variant="showForm ? 'outline' : 'primary'" :disabled="dispatchEnabled === false && !showForm" @click="showForm = !showForm">{{ showForm ? 'Փակել ձևը' : '+ Նոր նախապատվեր' }}</AppButton>
    </div>
    <p class="pre-orders__lead">
      Նկարագրեք աշխատանքը․ այն կտեսնեն և push ծանուցում կստանան բոլոր ակտիվ վարորդները։ Ով համարի, որ հարմար է, կգրի իր գինը (մյուսների գները չի տեսնի)։
      Հաճախորդի հեռախոսը վարորդներին չի ցուցադրվում։ Նախապատվերը բաց է, մինչև դուք այն փակեք․ կարող եք այն տալ մի քանի վարորդի հերթով։ Ամեն ամսվա սկզբին
      նախորդ ամիսների փակված նախապատվերները ջնջվում են, բացերը մնում են։
    </p>
    <p v-if="dispatchEnabled === false" class="pre-orders__off" role="alert">
      Ավտոմատ բաշխումն անջատված է (LIVE_DISPATCH_ENABLED)․ նոր նախապատվեր ստեղծել, ծանուցել կամ պատվեր տալ հնարավոր չէ։
    </p>
    <p v-if="createdNote" class="pre-orders__ok" role="status">{{ createdNote }}</p>

    <form v-if="showForm" class="pre-orders__form" novalidate @submit.prevent="submit">
      <OrderFormFields v-model="form" variant="preOrder" :tried-submit="triedSubmit" />
      <p v-if="formError" class="pre-orders__error" role="alert">{{ formError }}</p>
      <div class="pre-orders__form-actions">
        <AppButton variant="outline" :disabled="saving" @click="showForm = false">Չեղարկել</AppButton>
        <AppButton type="submit" :disabled="saving || dispatchEnabled === false">{{ saving ? 'Ուղարկվում է…' : 'Ուղարկել վարորդներին' }}</AppButton>
      </div>
    </form>

    <div class="pre-orders__tabs" role="tablist">
      <AppButton size="sm" :variant="status === 'OPEN' ? 'primary' : 'outline'" role="tab" :aria-selected="status === 'OPEN'" @click="setStatus('OPEN')">Բաց</AppButton>
      <AppButton size="sm" :variant="status === 'CLOSED' ? 'primary' : 'outline'" role="tab" :aria-selected="status === 'CLOSED'" @click="setStatus('CLOSED')">Փակված</AppButton>
    </div>
    <p v-if="error" class="pre-orders__error" role="alert">{{ error }}</p>
    <EmptyState
      v-if="empty"
      icon="clock"
      :title="status === 'OPEN' ? 'Բաց նախապատվերներ չկան' : 'Փակված նախապատվերներ դեռ չկան'"
      :description="status === 'OPEN' ? 'Ստեղծեք նոր նախապատվեր՝ վարորդներից գներ հավաքելու համար։' : undefined"
    />

    <ul class="pre-orders__list">
      <li v-for="item in items" :key="item.id">
        <NuxtLink :to="`/admin/orders/pre-orders/${item.id}`" class="card">
          <div class="card__top">
            <strong>#{{ item.id }} · {{ item.pickup.address }}<template v-if="item.destination"> → {{ item.destination.address }}</template></strong>
            <AppBadge :variant="preOrderStateLabel(item).tone">{{ preOrderStateLabel(item).text }}</AppBadge>
          </div>
          <div class="card__meta">
            <span v-if="preOrderVehicle(item)">{{ preOrderVehicle(item) }}</span>
            <AppBadge v-for="chip in preOrderRequirementChips(item)" :key="chip">{{ chip }}</AppBadge>
          </div>
          <div class="card__numbers">
            <span>Ծանուցվել է՝ <b>{{ item.recipients }}</b> վարորդ<template v-if="item.notify.rounds > 1"> ({{ item.notify.rounds }} անգամ)</template></span>
            <span>Գներ՝ <b>{{ item.bids }}</b></span>
            <span v-if="item.bestAmd !== null">Լավագույնը՝ <b>{{ formatPrice(item.bestAmd) }}</b></span>
            <span v-if="item.orders">Պատվերներ՝ <b>{{ item.orders }}</b></span>
            <span class="muted">{{ when(item.createdAt) }}</span>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.pre-orders {
  display: grid;
  gap: var(--space-3);
  padding-bottom: var(--space-6);
}
.pre-orders__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  h1 {
    margin: 0;
  }
}
.pre-orders__lead {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}
.pre-orders__ok {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-success-bg, #e8f6ee);
}
.pre-orders__off {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--color-danger-bg, #fdecec);
  color: var(--color-danger, #b42318);
  font-weight: 600;
}
.pre-orders__error {
  margin: 0;
  color: var(--color-danger, #b42318);
}
.pre-orders__form {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.pre-orders__tabs {
  display: flex;
  gap: var(--space-2);
}
.pre-orders__form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.pre-orders__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.card {
  display: grid;
  gap: 6px;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: inherit;
  text-decoration: none;
  &:hover {
    border-color: var(--color-primary);
  }
}
.card__top {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  align-items: flex-start;
}
.card__meta,
.card__numbers {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}
.muted {
  color: var(--color-text-muted);
}
</style>
