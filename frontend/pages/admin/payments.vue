<script setup lang="ts">
import { SITE_NAME } from '~/constants/site'
import { adminRepository, isApiEnabled, type AdminPayment, type PaymentStatus } from '~/repositories'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateNumeric } from '~/utils/formatters'

/**
 * One question per driver: has this month's payment come in.
 *
 * Deliberately its own page rather than a column on `/admin` — that list is
 * already the busiest one in the panel (vehicle specs, coverage, photos,
 * Telegram/password state…), and payment status is the one thing an admin
 * checks on its own, independent of everything else a truck's card shows.
 * This page shows exactly three things — who, their phone, and whether
 * they're settled — so scanning fifty rows for the unpaid ones stays fast.
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

onMounted(() => load())
// Same reasoning as the registration-review page: the admin token is read
// from localStorage by a client plugin that can land after this page mounts,
// so a first paint with no session is normal and a reload once it arrives is
// the fix, not an error state.
watch(
  () => adminAuth.isLoggedIn,
  (loggedIn) => {
    if (loggedIn && payments.value.length === 0) void load()
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

/** Asks the same question whether this is a driver's first payment ever or their next monthly one. */
async function markPaid(payment: AdminPayment): Promise<void> {
  if (!confirm(`Նշե՞լ ${payment.driverName}-ի վճարումը կատարված։`)) return

  actioningId.value = payment.id
  try {
    const updated = await adminRepository.setTowTruckPayment(payment.id, true)
    payment.lastPaymentAt = updated.lastPaymentAt
    payment.status = updated.status
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Վճարումը նշել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

/**
 * A convenience, not an automatic consequence of going overdue — nothing
 * deactivates a driver on its own. Only offered on a row that is both
 * `overdue` and still `isActive`; disappears the moment either stops being
 * true, so there is never a button promising to do something already done.
 * Reuses the same endpoint/reasoning as `toggleTowTruckActive` on `/admin`
 * (including its own conflict/confirm behaviour) rather than a copy.
 */
async function deactivate(payment: AdminPayment): Promise<void> {
  if (!confirm(`Ապաակտիվացնե՞լ ${payment.driverName}-ի պրոֆիլը։`)) return

  actioningId.value = payment.id
  try {
    const updated = await adminRepository.setTowTruckActive(payment.id, false)
    payment.isActive = updated.isActive
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Կարգավիճակը փոխել չհաջողվեց։')
  } finally {
    actioningId.value = null
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
                <span v-if="payment.lastPaymentAt" class="payments__muted">
                  {{ payment.status === 'paid' ? '' : 'Վճարել է՝ ' }}{{ formatDateNumeric(payment.lastPaymentAt) }}
                </span>
                <AppButton
                  v-if="showsPayButton(payment.status)"
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === payment.id"
                  @click="markPaid(payment)"
                >
                  Վճարել
                </AppButton>
                <!-- Only on a row that is both overdue and still active — see deactivate() -->
                <AppButton
                  v-if="payment.status === 'overdue' && payment.isActive"
                  variant="danger"
                  size="sm"
                  :disabled="actioningId === payment.id"
                  @click="deactivate(payment)"
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
  </div>
</template>

<style scoped lang="scss">
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
</style>
