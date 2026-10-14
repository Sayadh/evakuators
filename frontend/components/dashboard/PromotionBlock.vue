<script setup lang="ts">
import { myPromotionRepository } from '~/repositories/myPromotion.repository'
import type { PromotionProduct, PromotionScope, PromotionStatus } from '~/types/promotion'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateLong } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'
import { promotionPriceFrom } from '~/utils/promotionPrice'
import { submitPaymentForm } from '~/utils/submitPaymentForm'

/**
 * «Առաջխաղացում» — the driver buying their own place at the top of their town.
 *
 * ## What it is selling, and why a refresh is part of it
 *
 * The promoted block on a town page is ordered by who refreshed last, not by
 * who paid first. That is what makes a crowded town fair: ten drivers who each
 * bought a placement all reach the top during the day, instead of the earliest
 * buyer holding it and the other nine paying for a position they never see.
 *
 * So the product is two things, and the block shows both: days at the top, and
 * six presses a day to climb back up.
 *
 * ## The three states
 *
 * Deactivated listings render NOTHING — `visible` is false and the whole block
 * is gone. Selling a position on a site the driver is not on would be taking
 * money for something nobody can see.
 *
 * Without a live subscription the block is shown and says so, because the fix
 * is one screen up on the same page.
 *
 * Otherwise it sells `maxDays` days of the chosen product — which the server
 * caps at the subscription's own end date, so a placement can never outlive
 * the listing it decorates.
 *
 * ## Two products
 *
 * «Իմ քաղաքում վերևում» (HOME) and «Ամբողջ սպասարկման տարածքում» (AREA). The
 * second includes the first, so HOME days bought while AREA is running start
 * when it ends — the server counts it that way, and `maxDays` already says so.
 * They share one refresh allowance: both queue on the same "last refreshed".
 */
const status = ref<PromotionStatus | null>(null)
const loading = ref(true)
const loadError = ref('')
const days = ref(1)
const scope = ref<PromotionScope>('HOME')
const submitting = ref(false)
const refreshing = ref(false)
const actionError = ref('')

/**
 * How long to wait for the hand-off to the payment provider before admitting it
 * did not happen. Same reasoning, and the same number, as the subscription
 * block: a blocked `form-action` fails SILENTLY, and a button stuck on
 * «Ուղարկվում է…» forever is worse than a sentence.
 */
const REDIRECT_TIMEOUT_MS = 8000
const REDIRECT_FAILED_MESSAGE = 'Չհաջողվեց բացել վճարման էջը։ Փորձեք կրկին։'
let redirectTimer: number | undefined

interface ProductOption {
  scope: PromotionScope
  title: string
  description: string
}

const PRODUCTS: readonly ProductOption[] = [
  {
    scope: 'HOME',
    title: 'Իմ քաղաքում վերևում',
    description: 'Ձեր քաղաքի (շրջանի) էջում՝ բոլորից առաջ։',
  },
  {
    scope: 'AREA',
    title: 'Ամբողջ սպասարկման տարածքում',
    description:
      'Ձեր քաղաքում՝ բոլորից առաջ, իսկ մնացած սպասարկման քաղաքներում՝ տեղի վարորդներից հետո առաջինը։',
  },
]

/** The HOME product lives at the top level of the status — see the type */
function productOf(current: PromotionStatus, which: PromotionScope): PromotionProduct {
  if (which === 'AREA') return current.area
  return { activeUntil: current.activeUntil, maxDays: current.maxDays, brackets: current.brackets }
}

const product = computed(() => (status.value ? productOf(status.value, scope.value) : null))

const price = computed(() =>
  product.value ? promotionPriceFrom(product.value.brackets, days.value) : null,
)

/** The first day's price, for the product picker — from the server's ladder */
const firstDayPrice = computed<Partial<Record<PromotionScope, number>>>(() => {
  const prices: Partial<Record<PromotionScope, number>> = {}
  if (!status.value) return prices
  for (const option of PRODUCTS) {
    const value = promotionPriceFrom(productOf(status.value, option.scope).brackets, 1)
    if (value !== null) prices[option.scope] = value
  }
  return prices
})

const anyActive = computed(() => !!(status.value?.activeUntil || status.value?.area.activeUntil))

const canBuy = computed(
  () => (product.value?.maxDays ?? 0) > 0 && days.value >= 1 && days.value <= (product.value?.maxDays ?? 0),
)

/** Keep the day field inside the selected product's ceiling */
function clampDays(): void {
  days.value = Math.min(Math.max(days.value, 1), Math.max(product.value?.maxDays ?? 1, 1))
}

watch(scope, clampDays)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    status.value = await myPromotionRepository.getStatus()
    // Clamped on arrival rather than left out of range: the ceiling moves as a
    // subscription runs down, and a field holding 30 under a «մինչև 9 օր» label
    // is a form that disagrees with itself.
    clampDays()
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Չհաջողվեց բեռնել։')
  } finally {
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  if (redirectTimer !== undefined) window.clearTimeout(redirectTimer)
})

async function buy(): Promise<void> {
  if (submitting.value || !canBuy.value) return
  submitting.value = true
  actionError.value = ''

  try {
    const created = await myPromotionRepository.createPayment(days.value, scope.value)
    if (created.gateway) {
      submitPaymentForm(created.gateway)
      // The page is normally gone before this fires. When it is not, that is
      // the bug — see REDIRECT_TIMEOUT_MS.
      redirectTimer = window.setTimeout(() => {
        submitting.value = false
        actionError.value = REDIRECT_FAILED_MESSAGE
      }, REDIRECT_TIMEOUT_MS)
      return
    }

    // No gateway in this environment: the order is recorded and an admin
    // confirms it by hand, exactly as the subscription block behaves.
    await load()
    submitting.value = false
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Չհաջողվեց գրանցել պատվերը։')
    submitting.value = false
  }
}

async function refresh(): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  actionError.value = ''
  try {
    // The endpoint answers with the fresh status, so there is no second read
    // and no window where the screen and the server disagree.
    status.value = await myPromotionRepository.refresh()
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Չհաջողվեց թարմացնել։')
  } finally {
    refreshing.value = false
  }
}

/** «այսօր 14:32» — a refresh is a thing that happened today, almost always */
function formatMoment(iso: string): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString('hy-AM', { hour: '2-digit', minute: '2-digit' })
  const today = new Date().toDateString() === at.toDateString()
  return today ? `այսօր ${time}` : `${formatDateLong(iso)}, ${time}`
}
</script>

<template>
  <!-- Nothing at all for a deactivated listing — see the component comment. -->
  <div v-if="loading || status?.visible" class="promotion">
    <p v-if="loading" class="promotion__muted">Բեռնվում է…</p>
    <p v-else-if="loadError" class="promotion__error" role="alert">{{ loadError }}</p>

    <template v-else-if="status">
      <p class="promotion__intro">
        Առաջխաղացումը Ձեզ դնում է էջի վերևում։ Հերթականությունը որոշվում է վերջին
        թարմացմամբ — ով վերջինն է թարմացրել, նա է առաջինը։
      </p>

      <!-- The one case where the block is shown and sells nothing. -->
      <p v-if="status.blockedReason === 'no-subscription'" class="promotion__notice">
        Առաջխաղացում գնելու համար նախ պետք է ակտիվ բաժանորդագրություն ունենաք։ Վճարումը
        կարող եք կատարել վերևի «Վճարումներ» բաժնում։
      </p>

      <template v-else>
        <!-- A running placement: what is live, and the button that keeps it on top. -->
        <div v-if="anyActive" class="promotion__active">
          <p v-if="status.area.activeUntil" class="promotion__active-line">
            «Ամբողջ սպասարկման տարածքում»՝ ակտիվ է մինչև
            <strong>{{ formatDateLong(status.area.activeUntil) }}</strong>
          </p>
          <p v-if="status.activeUntil" class="promotion__active-line">
            «Իմ քաղաքում վերևում»՝ ակտիվ է մինչև
            <strong>{{ formatDateLong(status.activeUntil) }}</strong>
          </p>
          <p v-if="status.lastRefreshedAt" class="promotion__muted">
            Վերջին թարմացումը՝ {{ formatMoment(status.lastRefreshedAt) }}
          </p>
          <AppButton
            variant="success"
            :disabled="refreshing || status.refreshesLeft === 0"
            @click="refresh"
          >
            {{ refreshing ? 'Թարմացվում է…' : 'Թարմացնել' }}
          </AppButton>
          <p class="promotion__muted">
            Այսօր մնացել է {{ status.refreshesLeft }} թարմացում {{ status.refreshesPerDay }}-ից։
          </p>
        </div>

        <!-- Buying days: pick a product, then a day count within its ceiling.
             When the chosen product has nothing left to sell, that is said
             rather than shown as an empty form. -->
        <div class="promotion__buy">
          <fieldset class="promotion__products">
            <legend class="promotion__label">Ընտրեք տարբերակը</legend>
            <label
              v-for="option in PRODUCTS"
              :key="option.scope"
              class="promotion__product"
              :class="{ 'promotion__product--selected': scope === option.scope }"
            >
              <input v-model="scope" type="radio" name="promotion-scope" :value="option.scope">
              <span class="promotion__product-body">
                <span class="promotion__product-title">{{ option.title }}</span>
                <span class="promotion__product-text">{{ option.description }}</span>
                <span v-if="firstDayPrice[option.scope] !== undefined" class="promotion__product-text">
                  1 օրը՝ {{ formatPrice(firstDayPrice[option.scope]!) }}
                </span>
              </span>
            </label>
          </fieldset>

          <template v-if="product && product.maxDays > 0">
            <!-- Overlaps the driver should know about before paying. -->
            <p v-if="scope === 'HOME' && status.area.activeUntil" class="promotion__muted">
              «Իմ քաղաքում» օրերը կսկսվեն «Ամբողջ տարածքում» առաջխաղացման ավարտից հետո։
            </p>
            <p v-if="scope === 'AREA' && status.activeUntil" class="promotion__muted">
              «Իմ քաղաքում» առաջխաղացման մնացած օրերը կշարունակեն հաշվվել զուգահեռ։
            </p>
            <label for="promotion-days" class="promotion__label">
              Քանի՞ օր ({{ product.maxDays }}-ից ոչ ավելի)
            </label>
            <input
              id="promotion-days"
              v-model.number="days"
              type="number"
              inputmode="numeric"
              min="1"
              :max="product.maxDays"
              class="promotion__days"
            >
            <p class="promotion__price">
              <template v-if="price !== null">
                Արժեքը՝ <strong>{{ formatPrice(price) }}</strong>
              </template>
              <template v-else>Ընտրեք 1–{{ product.maxDays }} օր</template>
            </p>
            <AppButton :disabled="submitting || !canBuy" @click="buy">
              {{ submitting ? 'Ուղարկվում է…' : 'Վճարել' }}
            </AppButton>
          </template>
          <!-- Nothing left to sell for this product: the placement (or the one
               it queues behind) already runs to the subscription's last day. -->
          <p v-else class="promotion__muted">
            Այս տարբերակով առաջխաղացումն արդեն հասնում է բաժանորդագրության վերջին օրվան։
          </p>
        </div>
      </template>

      <p v-if="actionError" class="promotion__error" role="alert">{{ actionError }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.promotion {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__intro,
  &__notice {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.55;
  }

  &__notice {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-text-secondary);
  }

  &__active,
  &__buy {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-start;
  }

  &__buy {
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  &__active-line,
  &__price {
    margin: 0;
  }

  &__label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__products {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
  }

  &__product {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;

    input {
      margin-top: 3px;
      accent-color: var(--color-success);
    }

    &--selected {
      border-color: var(--color-success);
      background: var(--color-success-bg);
    }
  }

  &__product-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__product-title {
    font-weight: 600;
  }

  &__product-text {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    line-height: 1.45;
  }

  &__days {
    width: 120px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-family: inherit;
  }

  &__muted {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  &__error {
    margin: 0;
    color: var(--color-danger);
    font-size: 0.9rem;
  }
}
</style>
