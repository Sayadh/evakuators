<script setup lang="ts">
/**
 * Driver wallets (2026-11-12) — every app driver's prepaid balance, lowest
 * first (who cannot be offered orders), and one driver's statement.
 *
 * Money moves only through the ledger: Idram top-ups and order fees are
 * written by the system; this page adds the only manual movement — a credit
 * or debit with a note the driver sees in his app (cash at the office, a
 * goodwill credit, a correction). ADMIN only; the API refuses DISPATCHER.
 */
import { computed, onMounted, ref } from 'vue'
import { newIdempotencyKey, opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type { OpsDriverWallet, OpsPriceReview, OpsWalletEntryKind, OpsWalletRow, OpsWalletSummary } from '~/types/opsDispatch'
import { formatDateNumeric } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { apiErrorText } from '~/utils/opsDispatchLabels'

const adminAuth = useAdminAuthStore()

const KIND_LABEL: Record<OpsWalletEntryKind, string> = {
  TOPUP: 'Համալրում (Idram)',
  TOPUP_BONUS: 'Համալրման բոնուս',
  ORDER_FEE: 'Միջնորդավճար',
  ORDER_FEE_ADJUSTMENT: 'Միջնորդավճարի ճշգրտում',
  ORDER_FEE_REFUND: 'Վերադարձ',
  ADMIN_CREDIT: 'Մուտքագրում (ձեռքով)',
  ADMIN_DEBIT: 'Գանձում (ձեռքով)',
}

const rows = ref<OpsWalletRow[]>([])
const summary = ref<OpsWalletSummary | null>(null)
const summaryDays = ref(30)
const reviews = ref<OpsPriceReview[]>([])
const reviewPrice = ref<Record<number, string>>({})
const creditText = ref('')
/** One key per operator action, kept until the server answers */
const actionKeys = new Map<string, string>()
const keyFor = (action: string) => {
  if (!actionKeys.has(action)) actionKeys.set(action, newIdempotencyKey())
  return actionKeys.get(action)!
}
const search = ref('')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const selected = ref<OpsWalletRow | null>(null)
const detail = ref<OpsDriverWallet | null>(null)
const amountText = ref('')
const direction = ref<'credit' | 'debit'>('credit')
const note = ref('')
const busy = ref(false)
/** One key per operator action: a retried click cannot move money twice */
let pendingKey: string | null = null

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) => `${r.name ?? ''} ${r.phone ?? ''} ${r.driverId}`.toLowerCase().includes(q))
})
const lowCount = computed(() => rows.value.filter((r) => r.balanceAmd <= 0).length)

async function load() {
  error.value = null
  try {
    const [list, sum, pending] = await Promise.all([
      opsDispatchRepository.wallets(),
      opsDispatchRepository.walletSummary(summaryDays.value),
      opsDispatchRepository.priceReviews(),
    ])
    rows.value = list
    summary.value = sum
    reviews.value = pending
  } catch (e) {
    error.value = apiErrorText(e, 'Հաշիվները բեռնել չհաջողվեց։')
  }
}

async function resolveReview(review: OpsPriceReview, decision: 'APPROVE' | 'CORRECT') {
  const action = `review-${review.id}-${decision}`
  const corrected = Number(reviewPrice.value[review.id] ?? '')
  if (decision === 'CORRECT' && !(corrected > 0)) return
  busy.value = true
  error.value = null
  try {
    await opsDispatchRepository.resolvePriceReview(review.id, decision === 'APPROVE' ? { decision } : { decision, correctedPriceAmd: corrected }, keyFor(action))
    actionKeys.delete(action)
    notice.value = decision === 'APPROVE' ? `№ ${review.orderNumber}՝ գինը հաստատվեց, միջնորդավճարը վերադարձվեց։` : `№ ${review.orderNumber}՝ գինը ուղղվեց (${formatPrice(corrected)})։`
    await load()
  } catch (e) {
    error.value = apiErrorText(e, 'Չհաջողվեց։')
  } finally {
    busy.value = false
  }
}

async function saveCreditLimit() {
  if (!selected.value) return
  const value = Number(creditText.value.replace(/[\s,]/g, ''))
  if (!Number.isSafeInteger(value) || value < 0) return
  const action = `credit-${selected.value.driverId}-${value}`
  busy.value = true
  error.value = null
  try {
    await opsDispatchRepository.setCreditLimit(selected.value.driverId, value, keyFor(action))
    actionKeys.delete(action)
    notice.value = value > 0 ? `Վարկային սահման՝ ${formatPrice(value)}` : 'Վարկային սահմանը հանվեց'
    await Promise.all([load(), open(selected.value)])
  } catch (e) {
    error.value = apiErrorText(e, 'Չհաջողվեց (միայն ադմինիստրատորի համար)։')
  } finally {
    busy.value = false
  }
}

async function open(row: OpsWalletRow) {
  selected.value = row
  detail.value = null
  notice.value = null
  pendingKey = null
  try {
    detail.value = await opsDispatchRepository.driverWallet(row.driverId)
    creditText.value = String(detail.value.creditLimitAmd ?? 0)
  } catch (e) {
    error.value = apiErrorText(e, 'Հաշիվը բեռնել չհաջողվեց։')
  }
}

const amount = computed(() => {
  const n = Number(amountText.value.replace(/[\s,]/g, ''))
  return Number.isSafeInteger(n) && n > 0 ? n : null
})

/** Quick amounts for the most common hand credits (cash at the office, goodwill) */
const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000]

async function adjust() {
  if (!selected.value || amount.value === null) return
  const who = selected.value.name ?? `#${selected.value.driverId}`
  const question =
    direction.value === 'credit'
      ? `Մուտքագրե՞լ ${formatPrice(amount.value)} ${who}-ի հաշվին։ Գումարը կհայտնվի միանգամից, և վարորդը կստանա ծանուցում։`
      : `Գանձե՞լ ${formatPrice(amount.value)} ${who}-ի հաշվից։`
  if (!(await confirmDialog({ title: direction.value === 'credit' ? 'Մուտքագրել հաշվին' : 'Գանձել հաշվից', message: question, confirmLabel: direction.value === 'credit' ? 'Մուտքագրել' : 'Գանձել', danger: direction.value !== 'credit' }))) return
  busy.value = true
  error.value = null
  pendingKey ??= newIdempotencyKey()
  try {
    const signed = direction.value === 'credit' ? amount.value : -amount.value
    const text = note.value.trim()
    const result = await opsDispatchRepository.adjustWallet(selected.value.driverId, { amountAmd: signed, ...(text ? { note: text } : {}) }, pendingKey)
    pendingKey = null
    notice.value = `Նոր մնացորդ՝ ${formatPrice(result.balanceAmd)}`
    amountText.value = ''
    note.value = ''
    await Promise.all([load(), open(selected.value)])
    notice.value = `Նոր մնացորդ՝ ${formatPrice(result.balanceAmd)}`
  } catch (e) {
    error.value = apiErrorText(e, 'Չհաջողվեց (միայն ադմինիստրատորի համար)։')
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  adminAuth.init()
  void load()
})
useSeoMetaData({ title: 'Վարորդների հաշիվներ', description: 'Վարորդների հաշիվներ', path: '/admin/orders/wallets', noindex: true })
</script>

<template>
  <div class="container wallets">
    <OpsNav />
    <h1>Վարորդների հաշիվներ</h1>
    <p class="muted">
      Վարորդը համալրում է հաշիվը Idram-ով հավելվածից, և ամեն ընդունված պատվերից գանձվում է միջնորդավճար (սանդղակը՝
      <NuxtLink to="/admin/orders/settings">Կարգավորումներում</NuxtLink>)։ Մնացորդը չբավարարելու դեպքում վարորդին պատվերներ չեն
      առաջարկվում։ Զրոյական կամ բացասական մնացորդով՝ {{ lowCount }} վարորդ։
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice && !selected" class="ok" role="status">{{ notice }}</p>

    <section v-if="summary" class="wallets__summary">
      <div class="wallets__period">
        Վերջին
        <select v-model.number="summaryDays" @change="load">
          <option :value="1">1 օր</option>
          <option :value="7">7 օր</option>
          <option :value="30">30 օր</option>
          <option :value="90">90 օր</option>
        </select>
        <span v-if="!summary.billingEnabled" class="muted">· միջնորդավճարը դեռ անջատված է</span>
      </div>
      <div class="wallets__cards">
        <div class="stat"><span>Միջնորդավճար (զուտ)</span><strong>{{ formatPrice(summary.totals.feesNetAmd) }}</strong><small>{{ summary.totals.feeOrders }} պատվեր</small></div>
        <div class="stat"><span>Համալրումներ</span><strong>{{ formatPrice(summary.totals.topupsAmd) }}</strong><small>{{ summary.totals.topupsCount }} վճարում · բոնուս {{ formatPrice(summary.totals.bonusesAmd) }}</small></div>
        <div class="stat"><span>Վերադարձներ</span><strong>{{ formatPrice(summary.totals.refundsAmd) }}</strong><small>ձեռքով՝ +{{ formatPrice(summary.totals.adminCreditsAmd) }} / −{{ formatPrice(summary.totals.adminDebitsAmd) }}</small></div>
        <div class="stat"><span>Վարորդների հաշիվներում</span><strong>{{ formatPrice(summary.balances.heldAmd) }}</strong><small>պարտք՝ {{ formatPrice(summary.balances.owedAmd) }} ({{ summary.balances.inDebt }} վարորդ)</small></div>
        <div class="stat" :class="{ 'stat--warn': summary.balances.belowBaseFee > 0 }"><span>Պատվեր չեն ստանում</span><strong>{{ summary.balances.belowBaseFee }}</strong><small>մնացորդը չի բավարարում</small></div>
        <div class="stat" :class="{ 'stat--warn': summary.pendingPriceReviews > 0 }"><span>Ստուգել գինը</span><strong>{{ summary.pendingPriceReviews }}</strong><small>նվազագույն գներ</small></div>
      </div>
      <details v-if="summary.daily.length">
        <summary>Ըստ օրերի</summary>
        <table class="wallets__table">
          <thead><tr><th>Օր</th><th>Միջնորդավճար</th><th>Պատվեր</th><th>Համալրում</th></tr></thead>
          <tbody>
            <tr v-for="d in summary.daily" :key="d.day"><td>{{ d.day }}</td><td>{{ formatPrice(d.feesNetAmd) }}</td><td>{{ d.feeOrders }}</td><td>{{ formatPrice(d.topupsAmd) }}</td></tr>
          </tbody>
        </table>
      </details>
    </section>

    <section v-if="reviews.length" class="wallets__reviews">
      <h2>Ստուգել գինը <span class="count">{{ reviews.length }}</span></h2>
      <p class="muted">Վարորդը գրել է նվազագույն գինը։ Զանգեք հաճախորդին. եթե ճիշտ է՝ միջնորդավճարը կվերադարձվի վարորդին, եթե ոչ՝ գրեք իրական գինը։</p>
      <article v-for="r in reviews" :key="r.id" class="review">
        <div>
          <NuxtLink :to="`/admin/orders/${r.orderId}`"><strong>№ {{ r.orderNumber }}</strong></NuxtLink>
          · գինը՝ <strong>{{ formatPrice(r.priceAmd) }}</strong>
          <template v-if="r.routeMeters"> · {{ (r.routeMeters / 1000).toFixed(1) }} կմ</template>
          · {{ formatDateNumeric(r.createdAt) }}
          <div class="muted small">{{ r.pickupAddress }}<template v-if="r.destinationAddress"> → {{ r.destinationAddress }}</template></div>
          <div>
            Հաճախորդ՝ <a :href="`tel:${r.customer.phone}`">{{ r.customer.phone }}</a><template v-if="r.customer.name"> ({{ r.customer.name }})</template>
            · Վարորդ՝ {{ r.driver.name ?? `#${r.driver.id}` }}<template v-if="r.driver.phone"> <a :href="`tel:${r.driver.phone}`">{{ r.driver.phone }}</a></template>
          </div>
        </div>
        <div class="review__actions">
          <AppButton size="sm" :disabled="busy" @click="resolveReview(r, 'APPROVE')">Ճիշտ է</AppButton>
          <input v-model="reviewPrice[r.id]" type="number" min="1" placeholder="Իրական գինը, ֏" />
          <AppButton size="sm" variant="outline" :disabled="busy || !(Number(reviewPrice[r.id]) > 0)" @click="resolveReview(r, 'CORRECT')">Ուղղել</AppButton>
        </div>
      </article>
    </section>

    <div class="wallets__layout">
      <section>
        <input v-model="search" class="wallets__search" placeholder="Որոնել՝ անուն, հեռախոս" />
        <table class="wallets__table">
          <thead>
            <tr><th>Վարորդ</th><th>Մնացորդ</th><th>Պատվեր</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in visible" :key="r.driverId" :class="{ active: selected?.driverId === r.driverId }" @click="open(r)">
              <td>
                <strong>{{ r.name ?? `#${r.driverId}` }}</strong>
                <div class="muted small">{{ r.phone }}</div>
              </td>
              <td :class="{ neg: r.balanceAmd <= 0 }">
                {{ formatPrice(r.balanceAmd) }}
                <div v-if="r.creditLimitAmd" class="muted small">վարկ՝ {{ formatPrice(r.creditLimitAmd) }}</div>
              </td>
              <td class="muted">{{ r.completedOrders ?? 0 }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="selected" class="wallets__detail">
        <h2>{{ selected.name ?? `#${selected.driverId}` }}</h2>
        <p v-if="!detail" class="muted">Բեռնվում է…</p>
        <template v-else>
          <p class="wallets__balance" :class="{ neg: detail.balanceAmd <= 0 }">{{ formatPrice(detail.balanceAmd) }}</p>
          <p class="muted small">Միջնորդավճարը {{ detail.billingEnabled ? 'գանձվում է' : 'դեռ ՉԻ գանձվում (Կարգավորումներ → 1)' }}</p>

          <form v-if="adminAuth.role === 'ADMIN'" class="wallets__credit" @submit.prevent="saveCreditLimit">
            <label>
              Վարկային սահման (֏) — կարող է պատվերներ ստանալ մինչև այս չափով մինուս
              <input v-model="creditText" inputmode="numeric" />
            </label>
            <AppButton size="sm" variant="outline" type="submit" :disabled="busy">Պահել</AppButton>
            <p class="muted small">Տվեք միայն վստահելի վարորդներին ({{ selected.completedOrders ?? 0 }} ավարտված պատվեր)։ 0 = չկա։</p>
          </form>

          <form v-if="adminAuth.role === 'ADMIN'" class="wallets__form" @submit.prevent="adjust">
            <div class="wallets__dir">
              <label><input v-model="direction" type="radio" value="credit" /> Մուտքագրել (+)</label>
              <label><input v-model="direction" type="radio" value="debit" /> Գանձել (−)</label>
            </div>
            <div class="wallets__quick">
              <button v-for="q in QUICK_AMOUNTS" :key="q" type="button" class="wallets__chip" :class="{ on: amount === q }" @click="amountText = String(q)">
                {{ formatPrice(q) }}
              </button>
            </div>
            <input v-model="amountText" inputmode="numeric" placeholder="Գումար, ֏ (1 coin = 1 ֏)" />
            <input v-model="note" placeholder="Մեկնաբանություն (ոչ պարտադիր, վարորդը կտեսնի)" maxlength="500" />
            <AppButton type="submit" :disabled="busy || amount === null">
              {{ direction === 'credit' ? 'Մուտքագրել' : 'Գանձել' }}{{ amount ? ` ${formatPrice(amount)}` : '' }}
            </AppButton>
            <p v-if="notice" class="ok" role="status">{{ notice }}</p>
          </form>

          <h3>Գործարքներ</h3>
          <p v-if="detail.entries.length === 0" class="muted">Գործարքներ չկան։</p>
          <table v-else class="wallets__table">
            <tbody>
              <tr v-for="e in detail.entries" :key="e.id">
                <td>
                  {{ KIND_LABEL[e.kind] }}<template v-if="e.orderNumber"> · № {{ e.orderNumber }}</template>
                  <div v-if="e.note" class="muted small">{{ e.note }}</div>
                  <div class="muted small">{{ formatDateNumeric(e.createdAt) }}</div>
                </td>
                <td :class="{ pos: e.amountAmd > 0 }">{{ e.amountAmd > 0 ? '+' : '−' }}{{ formatPrice(Math.abs(e.amountAmd)) }}</td>
                <td class="muted">{{ formatPrice(e.balanceAfterAmd) }}</td>
              </tr>
            </tbody>
          </table>

          <h3>Idram համալրումներ</h3>
          <p v-if="detail.topups.length === 0" class="muted">Չկան։</p>
          <ul v-else class="wallets__topups">
            <li v-for="t in detail.topups" :key="t.paymentId">#{{ t.paymentId }} · {{ formatPrice(t.amountAmd) }} · {{ t.status }} · {{ formatDateNumeric(t.createdAt) }}</li>
          </ul>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wallets {
  padding: var(--space-5) 0 var(--space-8);
  &__quick {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  &__chip {
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--color-border, #e3e8ef);
    background: var(--color-surface, #fff);
    cursor: pointer;
    font: inherit;

    &.on {
      border-color: var(--color-primary, #14304f);
      background: var(--color-primary, #14304f);
      color: #fff;
    }
  }
  &__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    gap: var(--space-5);
    align-items: start;
    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  }
  &__search,
  &__form input:not([type='radio']) {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  &__table {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--space-3);
    td,
    th {
      padding: 8px;
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      vertical-align: top;
    }
    tbody tr {
      cursor: pointer;
    }
    tr.active {
      background: var(--color-surface-muted, #f4f6f9);
    }
  }
  &__detail {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }
  &__balance {
    font-size: 2rem;
    font-weight: 700;
    margin: 0;
  }
  &__form {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-4) 0;
  }
  &__dir {
    display: flex;
    gap: var(--space-4);
  }
  &__topups {
    padding-left: 1.2rem;
  }
}
.neg {
  color: var(--color-danger);
}
.pos {
  color: var(--color-success);
}
.muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.85rem;
}
.error {
  color: var(--color-danger);
}
.ok {
  color: var(--color-success);
}
.wallets__summary {
  margin: var(--space-4) 0;
}
.wallets__period {
  margin-bottom: var(--space-3);
}
.wallets__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--space-3);
}
.stat {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: grid;
  gap: 2px;
  span,
  small {
    color: var(--color-text-muted);
  }
  strong {
    font-size: 1.4rem;
  }
  &--warn {
    border-color: var(--color-warning, #d97706);
    background: #fff8eb;
  }
}
.wallets__reviews {
  margin: var(--space-5) 0;
}
.review {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-3);
  border: 1px solid var(--color-warning, #d97706);
  background: #fff8eb;
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  &__actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    input {
      width: 140px;
      padding: 6px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
    }
  }
}
.wallets__credit {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
  input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
}
.count {
  background: var(--color-warning, #d97706);
  color: #fff;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 0.85rem;
}
</style>
