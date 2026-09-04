<script setup lang="ts">
import { mySubscriptionsRepository } from '~/repositories'
import { computed, ref } from 'vue'
import type {
  MySubscriptionStatus,
  SubscriptionPayment,
  SubscriptionPlan,
  SubscriptionPlanCode,
} from '~/types/subscription'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateLong } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { submitPaymentForm } from '~/utils/submitPaymentForm'

/**
 * The driver's own billing section.
 *
 * ## What this step does and does not do
 *
 * Pressing «Վճարել» records the driver's INTENT to buy a plan and nothing
 * else: no money moves, and the payment comes back PENDING. There is no
 * payment provider wired up yet — that is the next step, and it is why the
 * copy below says «գրանցվեց» rather than «վճարվեց». Promising a driver their
 * payment went through when nothing was charged is the one thing this screen
 * must not do.
 */

/**
 * The driver's current subscription state, from `GET
 * /my/subscription-payments/status`. The parent already holds it (it decides
 * the whole dashboard's gate from the same object), so it is passed down
 * rather than fetched a second time here.
 *
 * Optional, and its absence means "do not block": the backend refuses a
 * duplicate payment on its own (`createPayment` answers 409), so the worst a
 * missing prop can produce is a clear error instead of a disabled button —
 * whereas defaulting to blocked would hide the pay button from someone who
 * needs it, over a prop nobody passed.
 */
const props = defineProps<{
  status?: MySubscriptionStatus['status']
  paidUntil?: string
}>()

/**
 * Covered, with more than the warning window left — the one state in which
 * paying again is a mistake rather than a renewal.
 *
 * Keyed on the backend's own `status` rather than on a date compared here, for
 * the same reason the dashboard's lock is: `createPayment` decides this
 * server-side, and a second copy of the rule in the browser is how the button
 * and the API end up disagreeing.
 */
const alreadyCovered = computed(() => props.status === 'paid')

const plans = ref<SubscriptionPlan[]>([])
const payments = ref<SubscriptionPayment[]>([])
const loading = ref(true)
const loadError = ref('')

/** Which plan's request is in flight — also what disables both buttons, so a double-press can't create two rows */
const submittingPlan = ref<SubscriptionPlanCode | null>(null)
const submitError = ref('')
const lastCreated = ref<SubscriptionPayment | null>(null)

const STATUS_LABELS: Record<SubscriptionPayment['status'], string> = {
  PENDING: 'Սպասում է վճարման',
  PAID: 'Վճարված',
  FAILED: 'Ձախողված',
  CANCELLED: 'Չեղարկված',
}

/**
 * Prices go through the shared `formatPrice` (`utils/formatPrice.ts`), which
 * groups by hand rather than through `Intl` — a locale-dependent separator is
 * a hydration mismatch, and that file documents the bug it came from.
 *
 * It hard-codes ֏, and that is correct here: every plan's currency is AMD by
 * construction (`SubscriptionPlan.currency: 'AMD'` on the backend), so a
 * currency-aware branch would be one nothing can reach.
 */

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    // One round trip each, in parallel: the plans are backend constants (cheap),
    // the history is one indexed query.
    const [planList, paymentList] = await Promise.all([
      mySubscriptionsRepository.getPlans(),
      mySubscriptionsRepository.getPayments(),
    ])
    plans.value = planList.items
    payments.value = paymentList
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Փաթեթները բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

/**
 * How long to wait for the browser to leave for the provider before treating
 * the handoff as failed. Generous on purpose: a slow connection still has to
 * win, and this only ever fires on a page that should no longer exist.
 */
const REDIRECT_TIMEOUT_MS = 8000

const REDIRECT_FAILED_MESSAGE =
  'Վճարման էջը բացել չհաջողվեց։ Փորձեք կրկին, իսկ եթե խնդիրը կրկնվի՝ զանգահարեք մեզ։'

async function pay(plan: SubscriptionPlan): Promise<void> {
  if (submittingPlan.value || alreadyCovered.value) return
  submittingPlan.value = plan.id
  submitError.value = ''
  lastCreated.value = null

  // `finally` runs on the way out of a `return` too, so without this the
  // button would flick back to enabled for the moment between submitting the
  // form and the browser actually leaving — long enough to press twice.
  let redirecting = false

  try {
    // Only the plan id travels — see mySubscriptions.repository.ts.
    const created = await mySubscriptionsRepository.createPayment(plan.id)

    // Hand over to the payment provider if this environment has one. The row
    // is already saved, so a driver who abandons the provider's page leaves a
    // PENDING request behind rather than nothing — which is what lets an admin
    // confirm it later if the money arrived another way.
    if (created.gateway) {
      redirecting = true
      submitPaymentForm(created.gateway)
      // A submitted form is not a guaranteed navigation: a CSP `form-action`
      // that does not list the provider blocks it SILENTLY — no request, no
      // error, only a console violation — and the button would then sit on
      // «Ուղարկվում է…» for as long as the driver was willing to wait. This
      // page is normally gone before the timer fires; when it is still here,
      // that is the bug, and saying so beats a spinner that never ends.
      window.setTimeout(() => {
        submittingPlan.value = null
        submitError.value = REDIRECT_FAILED_MESSAGE
      }, REDIRECT_TIMEOUT_MS)
      return
    }

    // No provider configured — the request is recorded and an admin confirms
    // it by hand, exactly as it worked before there was a gateway.
    lastCreated.value = created
    payments.value = [created, ...payments.value]
  } catch (error) {
    submitError.value = extractErrorMessage(error, 'Հայտը գրանցել չհաջողվեց, փորձեք կրկին։')
  } finally {
    if (!redirecting) submittingPlan.value = null
  }
}
</script>

<template>
  <div class="subscription-payments">
    <p v-if="loading" class="subscription-payments__muted">Բեռնվում է…</p>
    <p v-else-if="loadError" class="subscription-payments__error">{{ loadError }}</p>

    <template v-else>
      <!-- Said once, above the cards, rather than repeated on every disabled
           button: a driver who cannot pay needs to know WHY and until when,
           and a greyed-out button on its own reads as a broken page. -->
      <p v-if="alreadyCovered" class="subscription-payments__covered">
        Ձեր բաժանորդագրությունն ակտիվ է<template v-if="paidUntil">
          մինչև <strong>{{ formatDateLong(paidUntil) }}</strong></template>։
        Նոր վճարում կարող եք կատարել ժամկետի ավարտին մոտ։
      </p>

      <ul class="subscription-payments__plans">
        <li v-for="plan in plans" :key="plan.id" class="subscription-payments__plan">
          <div class="subscription-payments__plan-head">
            <h3 class="subscription-payments__plan-title">{{ plan.title }}</h3>
            <p class="subscription-payments__plan-price">{{ formatPrice(plan.price) }}</p>
          </div>
          <p class="subscription-payments__plan-description">{{ plan.description }}</p>
          <ul v-if="plan.features.length" class="subscription-payments__features">
            <li v-for="feature in plan.features" :key="feature">{{ feature }}</li>
          </ul>
          <AppButton
            block
            :disabled="submittingPlan !== null || alreadyCovered"
            @click="pay(plan)"
          >
            {{ submittingPlan === plan.id ? 'Ուղարկվում է…' : 'Վճարել' }}
          </AppButton>
        </li>
      </ul>

      <p v-if="submitError" class="subscription-payments__error">{{ submitError }}</p>

      <!-- Never «վճարվեց»: nothing was charged. The wording has to match what
           actually happened, or a driver stops looking for the payment step
           that does not exist yet. -->
      <div v-if="lastCreated" class="subscription-payments__created">
        <p class="subscription-payments__created-title">Հայտը գրանցվեց ✓</p>
        <dl class="subscription-payments__summary">
          <div>
            <dt>Փաթեթ</dt>
            <dd>{{ lastCreated.planTitle }}</dd>
          </div>
          <div>
            <dt>Գումար</dt>
            <dd>{{ formatPrice(lastCreated.amount) }}</dd>
          </div>
          <div>
            <dt>Ժամկետ</dt>
            <dd>
              {{ formatDateLong(lastCreated.periodStart) }} –
              {{ formatDateLong(lastCreated.periodEnd) }}
            </dd>
          </div>
          <div>
            <dt>Ձեր ID</dt>
            <dd>#{{ lastCreated.towTruckId }}</dd>
          </div>
        </dl>
        <p class="subscription-payments__note">
          Վճարման հնարավորությունը շուտով կմիանա. այս հայտը պահվել է, և վճարումը դեռ
          կատարված չէ։
        </p>
      </div>

      <!-- Collapsed by default, like every section on the dashboard itself.
           What a driver comes here to do is pay; what they already paid is a
           reference they open on purpose, and leaving it expanded pushed the
           plan cards up out of a phone's first screen. -->
      <details v-if="payments.length" class="subscription-payments__history">
        <summary class="subscription-payments__history-title">Հայտերի պատմություն</summary>
        <ul class="subscription-payments__list">
          <li v-for="payment in payments" :key="payment.id" class="subscription-payments__item">
            <span class="subscription-payments__item-plan">{{ payment.planTitle }}</span>
            <span class="subscription-payments__item-amount">
              {{ formatPrice(payment.amount) }}
            </span>
            <span class="subscription-payments__item-period">
              {{ formatDateLong(payment.periodStart) }} – {{ formatDateLong(payment.periodEnd) }}
            </span>
            <span class="subscription-payments__item-status">{{ STATUS_LABELS[payment.status] }}</span>
          </li>
        </ul>
      </details>
    </template>
  </div>
</template>

<style scoped lang="scss">
.subscription-payments {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__muted {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
    font-size: 0.9rem;
  }

  &__plans {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }

  &__plan {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &__plan-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  &__plan-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  &__plan-price {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    white-space: nowrap;
  }

  &__plan-description {
    margin: 0;
    font-size: 0.9rem;
    color: var(--color-text-secondary);
  }

  &__features {
    margin: 0;
    padding-left: var(--space-4);
    font-size: 0.88rem;
    color: var(--color-text-secondary);
  }

  &__created {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  &__created-title {
    margin: 0;
    font-weight: 600;
  }

  &__summary {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-2);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }

    dt {
      font-size: 0.82rem;
      color: var(--color-text-muted);
    }

    dd {
      margin: 0;
      font-size: 0.92rem;
    }
  }

  &__covered {
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    font-size: 0.9rem;
    color: var(--color-text-secondary);

    strong {
      color: var(--color-text);
    }
  }

  &__note {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  &__history {
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-3);
  }

  &__history-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);

    /* Same treatment as .dashboard-summary on the page itself: the native
       marker is replaced by a chevron that rotates on open. Repeated rather
       than shared because that rule lives in dashboard.vue's scoped block and
       a scoped style does not reach inside a child component. */
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '';
      flex: none;
      width: 20px;
      height: 20px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: center;
      transition: transform 0.3s ease;
    }
  }

  &__history[open] &__history-title::after {
    transform: rotate(180deg);
  }

  &__history > .subscription-payments__list {
    margin-top: var(--space-3);
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__item {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: baseline;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
  }

  &__item-plan {
    font-weight: 600;
  }

  &__item-period,
  &__item-status {
    color: var(--color-text-secondary);
  }

  &__item-status {
    margin-left: auto;
  }
}
</style>
