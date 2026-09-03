<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { adminRepository, isApiEnabled, type AdminPayment, type PaymentStatus } from '~/repositories'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type {
  AdminPendingPayment,
  DeactivationReason,
  SubscriptionPlan,
  SubscriptionPlanCode,
} from '~/types/subscription'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateNumeric } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'

/**
 * One question per driver: how far are they covered.
 *
 * Deliberately its own page rather than a column on `/admin` — that list is
 * already the busiest one in the panel (vehicle specs, coverage, photos,
 * Telegram/password state…), and payment status is the one thing an admin
 * checks on its own, independent of everything else a truck's card shows.
 * This page shows exactly three things — who, their phone, and whether
 * they're settled — so scanning fifty rows for the unpaid ones stays fast.
 *
 * Two ways money gets recorded, both landing in the same table:
 * - a driver pressed «Վճարել» on their dashboard, and their request waits in
 *   the queue at the top of this page until an admin confirms it;
 * - or they paid offline, and an admin records it directly on their row.
 * Both write a PAID SubscriptionPayment, so when a real payment provider is
 * wired up it simply becomes a third writer of the same thing — nothing on
 * this page has to change again.
 */
useSeoMetaData({
  title: `Վճարումներ | ${SITE_NAME}`,
  description: 'Ներքին մոդերացիայի էջ',
  path: '/admin',
  noindex: true,
})

const apiEnabled = isApiEnabled()
const adminAuth = useAdminAuthStore()

const payments = ref<AdminPayment[]>([])
const loading = ref(true)
/** True only while a debounced search request is in flight — never hides the list/search box the way `loading` does */
const searching = ref(false)
const loadError = ref('')
const actioningId = ref<number | null>(null)
const search = ref('')

/**
 * `showFullLoading: false` is for a search-triggered reload — the list and
 * search box stay on screen (only `searching` flips), unlike the initial
 * load's full-page skeleton.
 */
async function load(options: { showFullLoading?: boolean } = {}): Promise<void> {
  if (!apiEnabled || !adminAuth.isLoggedIn) {
    loading.value = false
    return
  }

  if (options.showFullLoading ?? true) {
    loading.value = true
  } else {
    searching.value = true
  }
  loadError.value = ''
  try {
    payments.value = await adminRepository.listTowTruckPayments(search.value.trim())
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Ցուցակը բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
    searching.value = false
  }
}

onMounted(() => {
  void load()
  void loadPending()
  void loadPlans()
})
// Same reasoning as the registration-review page: the admin token is read
// from localStorage by a client plugin that can land after this page mounts,
// so a first paint with no session is normal and a reload once it arrives is
// the fix, not an error state.
watch(
  () => adminAuth.isLoggedIn,
  (loggedIn) => {
    if (loggedIn && payments.value.length === 0) {
      void load()
      void loadPending()
    }
  },
)

/**
 * Matched server-side against driver name, company name and phone (see
 * `AdminRepository.listTowTruckPayments` / backend `AdminPaymentsQuery`) —
 * the earlier version filtered the already-loaded array client-side, which
 * only ever checked the driver's name. Going to the backend adds phone
 * search for free, and keeps working the same if this page's "load
 * everything at once" design ever changes to real pagination. Debounced so
 * a fast typist doesn't fire one request per keystroke.
 */
const SEARCH_DEBOUNCE_MS = 300
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

watch(search, () => {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => void load({ showFullLoading: false }), SEARCH_DEBOUNCE_MS)
})

onBeforeUnmount(() => clearTimeout(searchDebounceTimer))

/**
 * The queue of requests drivers have made. Loaded alongside the list rather
 * than behind a tab: an unconfirmed request is the one thing on this page
 * that someone is actively waiting on.
 */
const pending = ref<AdminPendingPayment[]>([])
const pendingError = ref('')
const decidingId = ref<number | null>(null)

async function loadPending(): Promise<void> {
  if (!apiEnabled || !adminAuth.isLoggedIn) return
  pendingError.value = ''
  try {
    pending.value = await adminRepository.listPendingSubscriptionPayments()
  } catch (error) {
    pendingError.value = extractErrorMessage(error, 'Հայտերը բեռնել չհաջողվեց։')
  }
}

/**
 * Confirming grants coverage, so the driver's row on the list below is now
 * stale — reload it rather than patching it here, since the backend decides
 * the new period (it extends live coverage instead of restarting it) and
 * guessing that in the browser would be a second copy of that rule.
 */
async function decide(request: AdminPendingPayment, status: 'PAID' | 'CANCELLED'): Promise<void> {
  if (status === 'CANCELLED' && !confirm(`Չեղարկե՞լ ${request.driver.name}-ի հայտը։`)) return

  decidingId.value = request.id
  pendingError.value = ''
  try {
    await adminRepository.decideSubscriptionPayment(request.id, status)
    pending.value = pending.value.filter((row) => row.id !== request.id)
    await load({ showFullLoading: false })
  } catch (error) {
    pendingError.value = extractErrorMessage(error, 'Հայտը մշակել չհաջողվեց։')
  } finally {
    decidingId.value = null
  }
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Չվճարված',
  paid: 'Վճարված է',
  'due-soon': 'Ժամկետը մոտենում է',
  overdue: 'Ժամկետանց է',
}

const STATUS_BADGE_VARIANT: Record<PaymentStatus, 'success' | 'neutral' | 'accent' | 'danger'> = {
  unpaid: 'neutral',
  paid: 'success',
  'due-soon': 'accent',
  overdue: 'danger',
}

type PaymentStatusFilter = PaymentStatus | 'ALL'

/**
 * Most-urgent-first, same ordering `sortPaymentsByUrgency` already gives the
 * list itself — so picking a status from this select reads as "narrow down
 * to the group I'm already scanning for," not an arbitrary reshuffle.
 */
const STATUS_FILTER_OPTIONS: { value: PaymentStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Բոլոր կարգավիճակները' },
  { value: 'overdue', label: STATUS_LABEL.overdue },
  { value: 'due-soon', label: STATUS_LABEL['due-soon'] },
  { value: 'unpaid', label: STATUS_LABEL.unpaid },
  { value: 'paid', label: STATUS_LABEL.paid },
]

const statusFilter = ref<PaymentStatusFilter>('ALL')

/**
 * Client-side, unlike the name/phone search above — `status` is already a
 * value the backend computed once (`derivePaymentStatus`) and sent down on
 * every row, so filtering on it here needs no round trip and, just as
 * importantly, no second copy of the day-threshold logic that decides it.
 * Combines with `search` for free: both narrow the same already-loaded,
 * already-backend-filtered `payments` array.
 */
const visiblePayments = computed(() => {
  if (statusFilter.value === 'ALL') return payments.value
  return payments.value.filter((payment) => payment.status === statusFilter.value)
})

/**
 * Recently paid (`status === 'paid'`) is the one state with no button next to
 * it — there is nothing for the admin to do, and a row that only ever needs
 * checking should not also carry an action. The button reappears once the
 * status turns `due-soon` or `overdue`, and for a driver never billed at all
 * (`unpaid`) it is the only thing the row shows besides the name and phone.
 */
function showsPayButton(status: PaymentStatus): boolean {
  return status !== 'paid'
}

/**
 * Recording a payment that arrived offline.
 *
 * Two things the admin chooses, and one they cannot. The PLAN, because the
 * status depends on how long the driver is covered — "they paid" is not an
 * answer any more, "they paid for one month" is. The DATE, because a driver
 * often pays days before an admin gets to it, and coverage should start when
 * the money arrived. The PRICE is never theirs: it comes from the same
 * constants the driver's dashboard is quoted from, so the two ways money gets
 * recorded cannot disagree about what a month costs.
 */
const plans = ref<SubscriptionPlan[]>([])
const payModalOpen = ref(false)
const payTarget = ref<AdminPayment | null>(null)
const payPlan = ref<SubscriptionPlanCode>('ONE_MONTH')
const payDate = ref('')
const payError = ref('')
const paySubmitting = ref(false)

const planOptions = computed(() =>
  plans.value.map((plan) => ({
    value: plan.id,
    label: `${plan.title} — ${formatPrice(plan.price)}`,
  })),
)

async function loadPlans(): Promise<void> {
  if (!apiEnabled || !adminAuth.isLoggedIn || plans.value.length > 0) return
  try {
    plans.value = (await adminRepository.listSubscriptionPlans()).items
  } catch {
    // Non-fatal: the picker simply stays empty and the modal says so, rather
    // than the whole page failing over a list of two constants.
    plans.value = []
  }
}

function todayDateKey(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function openPayModal(payment: AdminPayment): void {
  payTarget.value = payment
  payPlan.value = plans.value[0]?.id ?? 'ONE_MONTH'
  payDate.value = todayDateKey()
  payError.value = ''
  payModalOpen.value = true
  void loadPlans()
}

async function confirmPay(): Promise<void> {
  const payment = payTarget.value
  if (!payment) return

  if (!payDate.value) {
    payError.value = 'Նշեք վճարման ամսաթիվը'
    return
  }
  const chosenDate = new Date(`${payDate.value}T00:00:00`)
  if (Number.isNaN(chosenDate.getTime())) {
    payError.value = 'Սխալ ամսաթիվ'
    return
  }
  if (chosenDate.getTime() > Date.now()) {
    payError.value = 'Ամսաթիվը չի կարող ապագայում լինել'
    return
  }

  paySubmitting.value = true
  payError.value = ''
  try {
    await adminRepository.grantSubscriptionPayment(payment.id, payPlan.value, chosenDate.toISOString())
    payModalOpen.value = false
    // Reload rather than patch the row: the new coverage end is the backend's
    // to compute (it extends live coverage instead of restarting it), and
    // working it out here would be a second copy of that rule.
    await load({ showFullLoading: false })
  } catch (error) {
    payError.value = extractErrorMessage(error, 'Վճարումը գրանցել չհաջողվեց։')
  } finally {
    paySubmitting.value = false
  }
}

const deactivateDialogOpen = ref(false)
const deactivateTarget = ref<AdminPayment | null>(null)
const deactivateSubmitting = ref(false)
const deactivateError = ref('')

/**
 * A convenience, not an automatic consequence of going overdue — nothing
 * deactivates a driver on its own. Only offered on a row that is both
 * `overdue` and still `isActive`; disappears the moment either stops being
 * true, so there is never a button promising to do something already done.
 *
 * Asks WHY first, through the same dialog `/admin` uses: the answer decides
 * whether the driver can sign in and pay their own way back, or has to call
 * us. From this page it is almost always «չի վճարել», but the dialog does not
 * assume that — an admin standing on the payments screen may still be
 * deactivating someone for something else entirely.
 */
function openDeactivate(payment: AdminPayment): void {
  deactivateTarget.value = payment
  deactivateError.value = ''
  deactivateDialogOpen.value = true
}

async function confirmDeactivate(reason: DeactivationReason): Promise<void> {
  const payment = deactivateTarget.value
  if (!payment) return

  deactivateSubmitting.value = true
  deactivateError.value = ''
  try {
    const updated = await adminRepository.setTowTruckActive(payment.id, false, reason)
    payment.isActive = updated.isActive
    deactivateDialogOpen.value = false
  } catch (error) {
    deactivateError.value = extractErrorMessage(error, 'Կարգավիճակը փոխել չհաջողվեց։')
  } finally {
    deactivateSubmitting.value = false
  }
}
</script>

<template>
  <div class="container payments">
    <NuxtLink to="/admin" class="payments__back">← Ադմին վահանակ</NuxtLink>

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

    <LoadingSkeleton v-else-if="loading" variant="text" :count="6" />

    <p v-else-if="loadError" class="payments__error" role="alert">{{ loadError }}</p>

    <template v-else>
      <header class="payments__header">
        <h1>Վճարումներ</h1>
        <div class="payments__filters">
          <div class="payments__search-wrap">
            <AppInput v-model="search" placeholder="Փնտրել անունով կամ հեռախոսով…" class="payments__search" />
            <span v-if="searching" class="payments__searching">Փնտրվում է…</span>
          </div>
          <AppSelect
            v-model="statusFilter"
            :options="STATUS_FILTER_OPTIONS"
            placeholder="Կարգավիճակ"
            class="payments__status-filter"
          />
        </div>
      </header>

      <!-- Above the list: an unconfirmed request is the only thing on this
           page someone is actively waiting on. Hidden entirely when the queue
           is empty rather than shown as an empty box — this is a to-do list,
           and a permanent "nothing to do" panel is noise. -->
      <section v-if="pending.length > 0" class="payments__queue">
        <h2 class="payments__queue-title">Հաստատման սպասող հայտեր ({{ pending.length }})</h2>
        <p v-if="pendingError" class="payments__error" role="alert">{{ pendingError }}</p>
        <ul class="payments__queue-list">
          <li v-for="request in pending" :key="request.id" class="payments__queue-item">
            <div class="payments__queue-info">
              <span class="payments__queue-driver">{{ request.driver.name }}</span>
              <span class="payments__muted">{{ request.driver.phone }}</span>
              <span>{{ request.planTitle }} — {{ formatPrice(request.amount) }}</span>
              <span class="payments__muted">Հայտի օրը՝ {{ formatDateNumeric(request.createdAt) }}</span>
            </div>
            <div class="payments__queue-actions">
              <AppButton
                variant="success"
                size="sm"
                :disabled="decidingId === request.id"
                @click="decide(request, 'PAID')"
              >
                Հաստատել
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                :disabled="decidingId === request.id"
                @click="decide(request, 'CANCELLED')"
              >
                Չեղարկել
              </AppButton>
            </div>
          </li>
        </ul>
      </section>

      <EmptyState v-if="visiblePayments.length === 0" title="Ոչինչ չի գտնվել" icon="search" />

      <div v-else class="payments__table-wrap">
        <table class="payments__table">
          <thead>
            <tr>
              <th>Վարորդ</th>
              <th>Հեռախոս</th>
              <th>Վճարում</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="payment in visiblePayments" :key="payment.id">
              <td>{{ payment.driverName }}</td>
              <td>{{ payment.phone }}</td>
              <td class="payments__status">
                <AppBadge :variant="STATUS_BADGE_VARIANT[payment.status]">
                  {{ STATUS_LABEL[payment.status] }}
                </AppBadge>
                <span v-if="payment.paidUntil" class="payments__muted">
                  Մինչև՝ {{ formatDateNumeric(payment.paidUntil) }}
                </span>
                <span v-if="payment.pendingCount > 0" class="payments__muted">
                  · {{ payment.pendingCount }} սպասող հայտ
                </span>
                <AppButton
                  v-if="showsPayButton(payment.status)"
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === payment.id"
                  @click="openPayModal(payment)"
                >
                  Գրանցել վճարում
                </AppButton>
                <!-- Only on a row that is both overdue and still active — see deactivate() -->
                <AppButton
                  v-if="payment.status === 'overdue' && payment.isActive"
                  variant="danger"
                  size="sm"
                  :disabled="actioningId === payment.id"
                  @click="openDeactivate(payment)"
                >
                  Ապաակտիվացնել
                </AppButton>
                <AppBadge v-if="!payment.isActive" variant="neutral">Ապաակտիվացված</AppBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <AppModal v-model="payModalOpen" title="Գրանցել վճարում">
      <form class="pay-form" @submit.prevent="confirmPay">
        <p class="payments__muted">
          {{ payTarget?.driverName }} — ընտրեք փաթեթը և նշեք, երբ է գումարը ստացվել։
        </p>
        <AppSelect
          v-model="payPlan"
          :options="planOptions"
          label="Փաթեթ"
          hint="Գինը և ժամկետը փաթեթից են՝ գումարը ձեռքով չի մուտքագրվում"
        />
        <AppInput v-model="payDate" type="date" label="Վճարման ամսաթիվ" required />
        <p class="payments__muted">
          Եթե վարորդի ժամկետը դեռ չի սպառվել, նոր փաթեթը ավելանում է մնացածի վրա։
        </p>
        <p v-if="payError" class="payments__error" role="alert">{{ payError }}</p>
        <AppButton type="submit" variant="accent" block :disabled="paySubmitting">
          {{ paySubmitting ? 'Պահպանվում է…' : 'Գրանցել' }}
        </AppButton>
      </form>
    </AppModal>

    <DeactivateReasonDialog
      v-model="deactivateDialogOpen"
      :driver-name="deactivateTarget?.driverName"
      :submitting="deactivateSubmitting"
      :error="deactivateError"
      @confirm="confirmDeactivate"
    />
  </div>
</template>

<style scoped lang="scss">
/* The pending queue. Accent-tinted like the driver dashboard's own payments
   block and .dashboard-review--pending — the shared meaning across the app is
   "something is waiting on a person", not a success or a failure. */
.payments__queue {
  margin-bottom: var(--space-5);
  padding: var(--space-4);
  border: 1px solid rgba(246, 168, 33, 0.45);
  border-radius: var(--radius-lg);
  background: rgba(246, 168, 33, 0.1);

  &-title {
    margin: 0 0 var(--space-3);
    font-size: 1rem;
    font-weight: 600;
  }

  &-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &-info {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
    font-size: 0.9rem;
  }

  &-driver {
    font-weight: 600;
  }

  &-actions {
    display: flex;
    gap: var(--space-2);
  }
}

.payments {
  padding-top: var(--space-6);
  padding-bottom: var(--space-8);

  &__back {
    display: inline-block;
    margin-bottom: var(--space-4);
    font-size: 0.9rem;
    color: var(--color-text-secondary);

    &:hover {
      color: var(--color-primary);
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-bottom: var(--space-5);

    h1 {
      margin: 0;
    }
  }

  &__filters {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  &__search-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__search {
    width: 100%;
    max-width: 280px;
  }

  &__status-filter {
    width: 100%;
    max-width: 200px;
  }

  &__searching {
    font-size: 0.82rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  &__error {
    color: var(--color-danger);
  }

  &__table-wrap {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  &__table {
    width: 100%;
    border-collapse: collapse;

    th,
    td {
      padding: var(--space-3) var(--space-4);
      text-align: left;
      white-space: nowrap;
    }

    thead th {
      font-size: 0.78rem;
      color: var(--color-text-secondary);
      border-bottom: 1px solid var(--color-border);
    }

    tbody tr:not(:last-child) td {
      border-bottom: 1px solid var(--color-border);
    }
  }

  &__status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    white-space: normal;
  }

  &__muted {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }
}

.pay-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
