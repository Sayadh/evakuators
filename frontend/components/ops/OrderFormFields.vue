<script setup lang="ts">
/**
 * The order's questions, rendered once for both «+ Նոր պատվեր»
 * (pages/admin/orders/index.vue) and «✏️ Խմբագրել» (pages/admin/orders/[id].vue).
 * State, rules and the request body live in utils/orderForm.ts; the page owns
 * the <form>, the error line and the submit button.
 *
 * The state is the parent's reactive object, mutated in place through
 * `defineModel` — same pattern as RegistrationFormFields.vue.
 *
 * `locks` greys out what the backend would refuse on this order (a driver
 * already accepted it on those terms, or it is closed), with the reason next
 * to it, so a save never fails over a control the operator was allowed to touch.
 */
import { computed, type WritableComputedRef } from 'vue'
import PickupPrecisionPicker from '~/components/ops/PickupPrecisionPicker.vue'
import { REQUIREMENT_FIELDS, isPickupMissing, isPrecisionMissing, isPreOrderDestinationMissing, isPriceMissing, orderFormLocks, type OrderFormLocks, type OrderFormState } from '~/utils/orderForm'

const model = defineModel<OrderFormState>({ required: true })

const props = withDefaults(
  defineProps<{
    locks?: OrderFormLocks
    triedSubmit?: boolean
    /** Who can be chosen as the referring driver (2026-11-17) */
    drivers?: { driverId: number; driverName: string; phone: string }[]
    /**
     * 2026-11-17: «preOrder» = the same questions for a pre-order (price
     * collection): the phone is optional and operator-only, no plate, no
     * price, no referrer, and «Խնդիրը» becomes the comment drivers read.
     */
    variant?: 'order' | 'preOrder'
  }>(),
  {
    variant: 'order',
    locks: () => orderFormLocks(null),
    triedSubmit: false,
    drivers: () => [],
  },
)

/** The three answers, as strings for AppChoiceChips; the form keeps true / false / null */
type TriKey = 'yes' | 'no' | 'unknown'
const TRI_OPTIONS: { value: TriKey; label: string }[] = [
  { value: 'yes', label: 'Այո' },
  { value: 'no', label: 'Ոչ' },
  { value: 'unknown', label: 'Չգիտեմ' },
]
const toKey = (v: boolean | null): TriKey => (v === true ? 'yes' : v === false ? 'no' : 'unknown')
const fromKey = (k: string): boolean | null => (k === 'yes' ? true : k === 'no' ? false : null)

/** Each question as the operator asks it on the phone, with one line saying what it means */
const REQUIREMENT_TEXT: Record<(typeof REQUIREMENT_FIELDS)[number], { label: string; hint: string }> = {
  wheelsRoll: { label: 'Անիվները պտտվու՞մ են', hint: 'Մեքենան կարելի՞ է հրել։ Եթե ոչ՝ պետք են ռոլիկներ։' },
  steeringLocked: { label: 'Ղեկը կողպվա՞ծ է', hint: 'Ղեկը չի պտտվում, օրինակ՝ բանալին չկա։' },
  gearboxLocked: { label: 'Փոխանցման տուփը կողպվա՞ծ է', hint: 'Հնարավոր չէ չեզոք (N) դնել, օրինակ՝ ավտոմատ տուփ և նստած մարտկոց։ Եթե այո՝ պետք են ռոլիկներ։' },
}

/** One get/set per question, so each AppChoiceChips binds with v-model */
const tri = Object.fromEntries(
  REQUIREMENT_FIELDS.map((field) => [
    field,
    computed({
      get: () => toKey(model.value[field]),
      set: (key: string) => {
        model.value[field] = fromKey(key)
      },
    }),
  ]),
) as Record<(typeof REQUIREMENT_FIELDS)[number], WritableComputedRef<string>>

/** The question the «how many skates» row sits under: the first answer that needs them, or none */
const skatesAfter = computed<(typeof REQUIREMENT_FIELDS)[number] | null>(() =>
  model.value.wheelsRoll === false ? 'wheelsRoll' : model.value.gearboxLocked === true ? 'gearboxLocked' : null,
)

const SKATES_OPTIONS = [{ value: '', label: 'Նշված չէ' }, ...['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))]
const skatesCount = computed({
  get: () => model.value.wheelSkatesCount,
  set: (value: string) => {
    model.value.wheelSkatesCount = value as OrderFormState['wheelSkatesCount']
  },
})

const closed = computed(() => props.locks.closed)
/** A driver is attached (and the order is still open): the terms he accepted are fixed */
const assignedLock = computed(() => !closed.value && props.locks.pickup)
const priceMissing = computed(() => isPriceMissing(model.value))
const precisionMissing = computed(() => isPrecisionMissing(model.value))
const pre = computed(() => props.variant === 'preOrder')
/** Shown on both forms: the pickup description is required on an order and a pre-order alike */
const pickupMissing = computed(() => !props.locks.pickup && isPickupMissing(model.value))
const destinationMissing = computed(() => pre.value && isPreOrderDestinationMissing(model.value))
</script>

<template>
  <div class="order-fields">
    <p v-if="closed" class="order-fields__lock">Պատվերը փակված է․ կարելի է փոխել միայն ներքին նշումը։</p>
    <p v-else-if="assignedLock" class="order-fields__lock">
      Վարորդն արդեն ընդունել է պատվերը այս պայմաններով․ վերցնելու կետը, քաշը, տեխնիկական վիճակը և գնի տեսակը փոխելու համար նախ հանեք վարորդին։
      Գնի կամ հասցման կետի փոփոխության մասին վարորդը կստանա ծանուցում։
    </p>

    <fieldset class="order-fields__group" :disabled="closed">
      <div class="row">
        <label v-if="pre">Հաճախորդի հեռախոս (վարորդները չեն տեսնում)<input v-model="model.customerPhone" placeholder="+374 91 00 00 01" autocomplete="off" /></label>
        <label v-else>Հաճախորդի հեռախոս*<input v-model="model.customerPhone" required placeholder="+374 91 00 00 01" autocomplete="off" /></label>
        <label>Անուն<input v-model="model.customerName" autocomplete="off" /></label>
      </div>
      <div class="row">
        <label>Վերցնելու կետի կոորդինատներ (եթե կա)<input v-model="model.pickupCoords" placeholder="40.1772, 44.5126" :disabled="locks.pickup" /></label>
        <label>
          Վերցնելու հասցե/նկարագրություն*
          <input
            v-model="model.pickupAddress"
            required
            minlength="2"
            :disabled="locks.pickup"
            :class="{ 'is-invalid': triedSubmit && pickupMissing }"
            :aria-invalid="triedSubmit && pickupMissing"
          />
          <small v-if="triedSubmit && pickupMissing" class="order-fields__field-error">Պարտադիր է՝ գրեք, թե որտեղից պետք է վերցնել</small>
        </label>
      </div>
      <PickupPrecisionPicker
        v-if="model.pickupCoords.trim()"
        v-model="model.pickupPrecision"
        name="pickupPrecision"
        :disabled="locks.pickup"
        :invalid="triedSubmit && precisionMissing"
      />
      <div class="row">
        <label>Հասցման կետի կոորդինատներ (եթե կա)<input v-model="model.destinationCoords" placeholder="Եթե հայտնի է" /></label>
        <label v-if="pre">
          Ուր տանել (հասցե/նկարագրություն)*
          <input
            v-model="model.destinationAddress"
            required
            minlength="2"
            :class="{ 'is-invalid': triedSubmit && destinationMissing }"
            :aria-invalid="triedSubmit && destinationMissing"
          />
          <small v-if="triedSubmit && destinationMissing" class="order-fields__field-error">Պարտադիր է՝ գրեք, թե ուր պետք է տանել</small>
        </label>
        <label v-else>Հասցման կետի նկարագրություն<input v-model="model.destinationAddress" /></label>
      </div>
      <p class="order-fields__hint">
        Կոորդինատները պատճենեք Google Maps-ից (երկար սեղմում կետի վրա)։ Առանց վերցնելու կետի կոորդինատների ավտոմատ որոնումը չի աշխատի․ պատվերը կուղարկեք
        կոնկրետ վարորդի ձեռքով։
      </p>
      <div class="row">
        <label>Մակնիշ<input v-model="model.make" /></label>
        <label>Մոդել<input v-model="model.model" /></label>
        <label v-if="!pre">Համարանիշ<input v-model="model.plate" /></label>
        <label>Քաշ (կգ)<input v-model="model.weightKg" type="number" min="100" max="60000" :disabled="locks.weight" /></label>
      </div>
      <button v-if="!locks.weight" type="button" class="order-fields__chip" @click="model.weightKg = '2000'">Սովորական մարդատար ≈ 2000 կգ</button>
      <label v-if="pre">
        Մեկնաբանություն վարորդների համար
        <textarea v-model="model.problemDescription" rows="3" placeholder="օր.՝ Վորտեքսից պահեստամասեր, մեքենան քաշել, ռոլիկներ պետք են" />
      </label>
      <label v-else>Խնդիրը<textarea v-model="model.problemDescription" rows="2" /></label>

      <fieldset class="order-fields__tri" :disabled="locks.requirements">
        <legend>Տեխնիկական վիճակ <small>(ըստ ցանկության)</small></legend>
        <div class="tri-list">
          <template v-for="field in REQUIREMENT_FIELDS" :key="field">
            <div class="tri-list__row" :class="{ 'tri-list__row--set': model[field] !== null }">
              <span :id="`tri-${field}`" class="tri-list__label">
                {{ REQUIREMENT_TEXT[field].label }}
                <small class="tri-list__hint">{{ REQUIREMENT_TEXT[field].hint }}</small>
              </span>
              <AppChoiceChips v-model="tri[field].value" :options="TRI_OPTIONS" :name="`req-${field}`" class="tri-list__chips" :aria-labelledby="`tri-${field}`" />
            </div>
            <!-- Skates needed (wheels don't roll / gearbox locked): only drivers who have them; how many is optional.
                 Shown once, under the first answer that asked for them. -->
            <div v-if="field === skatesAfter" class="tri-list__row tri-list__row--sub">
              <span id="tri-skates" class="tri-list__label">
                Քանի՞ ռոլիկ է պետք <small>(ըստ ցանկության)</small>
              </span>
              <AppChoiceChips v-model="skatesCount" :options="SKATES_OPTIONS" name="req-skates" class="tri-list__chips" aria-labelledby="tri-skates" />
              <p class="tri-list__note">Պատվերը կառաջարկվի միայն անիվային ռոլիկներ ունեցող վարորդներին։</p>
            </div>
          </template>
        </div>
      </fieldset>

      <fieldset v-if="!pre" class="order-fields__pricing">
        <legend>Գին</legend>
        <div class="order-fields__price-modes" role="radiogroup" aria-label="Գնի տեսակ">
          <button
            type="button"
            role="radio"
            class="order-fields__price-mode"
            :class="{ on: model.pricingMode === 'NEGOTIATION_REQUIRED' }"
            :aria-checked="model.pricingMode === 'NEGOTIATION_REQUIRED'"
            :disabled="locks.pricingMode"
            @click="model.pricingMode = 'NEGOTIATION_REQUIRED'"
          >
            <strong>Վարորդը կհամաձայնեցնի</strong>
            <span>Զանգում է հաճախորդին և գրում գինը հավելվածում՝ պարտադիր մինչ շարժվելը</span>
          </button>
          <button
            type="button"
            role="radio"
            class="order-fields__price-mode"
            :class="{ on: model.pricingMode === 'FIXED' }"
            :aria-checked="model.pricingMode === 'FIXED'"
            :disabled="locks.pricingMode"
            @click="model.pricingMode = 'FIXED'"
          >
            <strong>Ֆիքսված գին</strong>
            <span>Դուք արդեն համաձայնեցրել եք հաճախորդի հետ</span>
          </button>
        </div>
        <label v-if="model.pricingMode === 'FIXED'" class="order-fields__price-input">
          Համաձայնեցված գինը*
          <span class="order-fields__amd">
            <input
              v-model="model.quotedPriceAmd"
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
          <small v-if="triedSubmit && priceMissing" class="order-fields__field-error">Պարտադիր է՝ գրեք համաձայնեցված գինը</small>
        </label>
      </fieldset>
    </fieldset>

    <label v-if="!pre" class="order-fields__note">
      Փոխանցող վարորդ (եթե պատվերը մեզ տվել է վարորդը)
      <select v-model="model.referrerDriverId" :disabled="closed">
        <option :value="null">— չկա —</option>
        <option v-for="d in drivers" :key="d.driverId" :value="d.driverId">{{ d.driverName }} · {{ d.phone }}</option>
      </select>
      <small class="order-fields__hint">
        Երբ պատվերը կատարի ուրիշ վարորդ և այն ավարտվի, փոխանցողի հաշվին ավտոմատ կմուտքագրվի միջնորդավճարի իր բաժինը (տոկոսը՝ Կարգավորումներում)։
      </small>
    </label>
    <label class="order-fields__note">Ներքին նշում (վարորդը չի տեսնում)<textarea v-model="model.internalNote" rows="2" /></label>
  </div>
</template>

<style scoped lang="scss">
.order-fields {
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
  input:disabled,
  textarea:disabled,
  select:disabled,
  button:disabled {
    background: var(--color-surface-muted, #f4f6f9);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
  .row {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }

  &__group {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: grid;
    gap: var(--space-3);
  }
  &__lock {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: #fff7e6;
    color: #92400e;
    font-size: 0.85rem;
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
    border-radius: var(--radius-md, 10px);
    padding: var(--space-2) var(--space-3) var(--space-3);
    margin: 0;
    min-width: 0;
    display: grid;
    gap: var(--space-2);

    legend {
      padding: 0 6px;
      font-weight: 600;
      color: var(--color-text);
      small {
        font-weight: 400;
        color: var(--color-text-muted);
      }
    }
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
    &:hover:not(:disabled) {
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
  }
  .is-invalid {
    border-color: var(--color-danger, #d64545) !important;
    box-shadow: 0 0 0 3px var(--color-danger-bg, #fdecec);
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
}

.tri-list {
  display: grid;

  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding: 10px 2px;
    border-top: 1px solid var(--color-border);

    &:first-child {
      border-top: 0;
    }
    /* The follow-up to «Անիվները պտտվում են՝ Ոչ» — indented under it */
    &--sub {
      border-top: 0;
      margin: 0 0 4px 14px;
      padding: 10px 12px;
      border-left: 3px solid var(--color-primary);
      border-radius: 0 var(--radius-sm, 8px) var(--radius-sm, 8px) 0;
      background: var(--color-bg-subtle, #f7f8fa);
    }
  }

  &__label {
    display: grid;
    gap: 2px;
    font-size: 0.92rem;
    color: var(--color-text);
    small {
      font-size: 0.8rem;
      font-weight: 400;
      color: var(--color-text-muted);
    }
  }
  &__row--set > &__label {
    font-weight: 600;
  }

  /* Compact chips: these sit in a dense form, not on a landing page */
  &__chips :deep(.chips__row) {
    gap: 6px;
    justify-content: flex-end;
  }
  &__chips :deep(.chips__chip) {
    padding: 5px 14px;
    font-size: 0.85rem;
  }

  &__note {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }

  @media (max-width: 600px) {
    &__row {
      grid-template-columns: 1fr;
    }
    &__chips :deep(.chips__row) {
      justify-content: flex-start;
    }
  }
}

fieldset:disabled .tri-list {
  opacity: 0.6;
  pointer-events: none;
}
</style>
