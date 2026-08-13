<script setup lang="ts">
import { SERVICE_CATEGORIES } from '~/constants/services'
import {
  CAPACITY_RANGE_OPTIONS,
  VEHICLE_TYPE_DESCRIPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '~/constants/vehicles'
import type { SelectOption } from '~/types/common'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import {
  isAvailable247,
  isManipulatorVehicleType,
  type RegistrationFormErrors,
} from '~/utils/registrationForm'
import type { RegistrationFormState } from '~/utils/registrationPayload'

/**
 * Every question the registration form asks, except the photos.
 *
 * ## Why this is a component and not two copies of the same markup
 *
 * Two pages render this form: `/register`, where a driver fills it in, and
 * `/admin/registrations/:id`, where a moderator sees it again pre-filled and
 * corrects it before approving. What the moderator submits is what gets
 * published, so the two forms must offer **exactly** the same fields with
 * exactly the same rules — a question missing from the admin copy is an answer
 * silently dropped at the moment a profile goes live, and a question missing
 * from the public copy is one the driver never got to answer at all.
 *
 * That parity is the whole reason this file exists. The repo already carries
 * the same rule between registration and the driver dashboard, enforced only by
 * a note in CLAUDE.md and human discipline; here it is enforced by there being
 * one file. Its backend mirror is `RegistrationProfileDto`, the single class
 * both `CreateRegistrationDto` and `ApproveRegistrationDto` extend.
 *
 * ## What is deliberately NOT here
 *
 * - **Photos.** The driver uploads them; the moderator only looks at what was
 *   uploaded. There is no shared behaviour to extract, and pretending there is
 *   would mean an upload widget on a page that cannot upload.
 * - **The submit button, the intro copy, the page heading.** One page says
 *   «Ուղարկել հայտը», the other «Հաստատել և ստեղծել պրոֆիլ», and the sentence
 *   above the form addresses two different readers.
 * - **The admin-only fields** (slug, base placement, description). Those are
 *   not questions for a driver; they live on the review page.
 *
 * ## The state is mutated in place
 *
 * `defineModel` here holds the whole reactive form object, and the fields below
 * write to its properties. That is one shared object rather than thirty
 * `update:` events — the parent already owns it, passes it in, and reads it
 * back on submit. `v-model="model.firstName"` writes through to the same object
 * the page validates.
 */
const model = defineModel<RegistrationFormState>({ required: true })

const props = withDefaults(
  defineProps<{
    errors: RegistrationFormErrors
    /**
     * The five "open Google Maps, long-press, copy" steps under the coordinate
     * box. On by default, because they are written for a driver doing this on
     * their own phone for the first time.
     *
     * The review page turns them off: telling an administrator that «an
     * administrator will help you» reads as a bug, and they are not the person
     * the instructions describe. Same call `/admin`'s coordinate dialogs
     * already make.
     */
    showCoordinateGuidance?: boolean
  }>(),
  { showCoordinateGuidance: true },
)

/** Read-only view, so the template can stay `errors.x` like it was in the page */
const errors = computed(() => props.errors)

const is247 = computed(() => isAvailable247(model.value.services))
const isManipulatorType = computed(() => isManipulatorVehicleType(model.value.vehicleType))

// If the driver switches to 24/7 after picking custom hours, clear them so a
// stale value never gets left behind — `buildRegistrationPayload` ignores them
// while is247 is true anyway, but empty fields are less confusing to look at.
watch(is247, (value) => {
  if (value) {
    model.value.workingHoursStart = ''
    model.value.workingHoursEnd = ''
  }
})

watch(isManipulatorType, (value) => {
  if (value) model.value.manipulator = true
})

const vehicleTypeOptions: SelectOption[] = VEHICLE_TYPE_OPTIONS.map((option) => ({
  value: option.value as string,
  label: option.label,
}))

const vehicleTypeHints = VEHICLE_TYPE_OPTIONS.map((option) => ({
  label: option.label,
  description: VEHICLE_TYPE_DESCRIPTIONS[option.value],
}))

/** v-model wrapper that keeps a phone field locked to +374 + up to 8 digits */
function armenianPhoneModel(key: 'phone' | 'secondaryPhone' | 'whatsapp') {
  return computed<string>({
    get: () => model.value[key],
    set: (value) => {
      model.value[key] = armenianPhoneInputValue(value)
    },
  })
}

const phoneModel = armenianPhoneModel('phone')
const secondaryPhoneModel = armenianPhoneModel('secondaryPhone')
const whatsappModel = armenianPhoneModel('whatsapp')
</script>

<template>
  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">Անձնական տվյալներ</legend>
    <div class="reg-fields__grid">
      <AppInput v-model="model.firstName" label="Անուն" required :error="errors.firstName" />
      <AppInput v-model="model.lastName" label="Ազգանուն" required :error="errors.lastName" />
      <AppInput v-model="model.companyName" label="Կազմակերպության անուն (եթե կա)" />
      <div class="reg-fields__phone-field">
        <AppInput
          v-model="phoneModel"
          label="Հիմնական հեռախոսահամար"
          type="tel"
          placeholder="+37491000001"
          required
          :maxlength="12"
          :error="errors.phone"
        />
        <!-- Wrapped with the field rather than dropped straight into the grid:
             a bare <p> there would become its own grid cell and push every
             field after it into the wrong column. -->
        <p class="reg-fields__phone-hint">
          Այս հեռախոսահամարով գրանցվել հնարավոր է միայն մեկ անգամ։ Կրկնակի հայտը
          ադմինիստրատորի կողմից կմերժվի։
        </p>
      </div>
      <AppInput
        v-model="secondaryPhoneModel"
        label="Երկրորդ հեռախոսահամար (ոչ պարտադիր)"
        type="tel"
        placeholder="+37499000001"
        :maxlength="12"
        :error="errors.secondaryPhone"
      />
      <AppInput
        v-model="whatsappModel"
        label="WhatsApp"
        type="tel"
        placeholder="+37491000001"
        :maxlength="12"
        :error="errors.whatsapp"
      />
      <AppInput v-model="model.telegram" label="Telegram (username)" placeholder="@username" />
      <AppInput
        v-model="model.email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        :error="errors.email"
      />
    </div>
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">Մեքենայի տվյալներ</legend>
    <div class="reg-fields__grid">
      <AppInput
        v-model="model.brand"
        label="Մակնիշ"
        placeholder="Isuzu"
        required
        :error="errors.brand"
      />
      <AppInput v-model="model.model" label="Մոդել (ոչ պարտադիր)" placeholder="NPR 75" />
      <AppInput
        v-model="model.year"
        label="Տարեթիվ"
        type="number"
        placeholder="2018"
        required
        :error="errors.year"
      />
      <AppSelect
        v-model="model.vehicleType"
        :options="vehicleTypeOptions"
        label="Տեսակ"
        :error="errors.vehicleType"
      >
        <template #label-suffix>
          <AppTooltip label="Էվակուատորի տեսակների բացատրություն">
            <span v-for="hint in vehicleTypeHints" :key="hint.label" class="reg-fields__type-hint">
              <strong>{{ hint.label }}</strong>
              {{ hint.description }}
            </span>
          </AppTooltip>
        </template>
      </AppSelect>
      <AppSelect
        v-model="model.capacity"
        :options="CAPACITY_RANGE_OPTIONS"
        label="Առավելագույն բեռնատարողություն *"
        :error="errors.capacity"
      />
      <PlatformDimensionsInput
        v-model:length="model.platformLengthM"
        v-model:width="model.platformWidthM"
        :error="errors.platformDimensions"
      />
    </div>
    <div class="reg-fields__checks">
      <AppCheckbox v-model="model.winch" label="Ունի ճախարակ (winch, лебедка)" />
      <!-- Locked, not hidden: someone who picked the manipulator type should
           still SEE that the answer is yes, rather than wonder where the
           question went. -->
      <AppCheckbox
        v-model="model.manipulator"
        label="Ունի մանիպուլյատոր"
        :disabled="isManipulatorType"
      />
      <AppCheckbox v-model="model.wheelSkates" label="Առկա են անիվային ռոլիկներ">
        <template #label-suffix>
          <AppTooltip label="Անիվային ռոլիկների բացատրություն">
            Անիվային ռոլիկներն օգտագործվում են արգելափակված կամ չպտտվող անիվներով մեքենան
            անվտանգ հարթակ բարձրացնելու և տեղափոխելու համար։
          </AppTooltip>
        </template>
      </AppCheckbox>
    </div>
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">Տարածքներ</legend>
    <p class="reg-fields__note">
      Խնդրում ենք ընտրել միայն այն քաղաքներն, որտեղ պատրաստ եք մոտենալ և բարձել
      մեքենան։ Խորհուրդ ենք տալիս չընտրել հիմնական վայրից ավելի քան 30 կմ հեռու տարածքներ, քանի
      որ նման պատվերները կարող են շահավետ չլինել։
    </p>
    <p class="reg-fields__note">
      Ընտրված տարածքը վերաբերում է միայն բարձման վայրին․ տեղափոխման վերջնակետը կարող է լինել ՀՀ
      ցանկացած բնակավայր։
    </p>
    <!-- Same component the dashboard uses, so what can be picked here and what
         can be changed later can never drift apart. -->
    <ServiceAreaPicker
      v-model:regions="model.regionSlugs"
      v-model:cities="model.citySlugs"
      :regions-error="errors.regionSlugs"
      :cities-error="errors.citySlugs"
    />
  </fieldset>

  <!-- Its own section rather than a field inside "Տարածքներ": the areas above
       are where a driver is willing to GO, this is where they actually ARE, and
       the two answers get confused when they share a heading. Same component
       the dashboard and admin dialogs use. -->
  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">Տեղադիրք</legend>
    <!-- The one section that may be skipped. It asks for a value copied out of
         Google Maps on a phone, which is the step most likely to end a
         registration — and the value is editable from the dashboard the moment
         a driver is approved, so blocking on it trades a whole driver for one
         field. `required: false` also switches the note at the bottom of the
         block from "paste the example number" to "leave it blank", which is the
         only honest advice once it is optional. -->
    <CoordinatesInput
      v-model="model.coordinates"
      heading="Նշեք Ձեր էվակուատորի հիմնական տեղադիրքի կոորդինատները (ոչ պարտադիր)"
      :required="false"
      :show-guidance="showCoordinateGuidance"
      :error="errors.coordinates"
    />
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">Ծառայություններ</legend>
    <p v-if="errors.services" class="reg-fields__error" role="alert">{{ errors.services }}</p>
    <ServiceCategoryPicker v-model="model.services" :categories="SERVICE_CATEGORIES" mode="form" />

    <div v-if="!is247" class="reg-fields__working-hours">
      <p class="reg-fields__working-hours-label">Աշխատանքային ժամեր (ոչ պարտադիր)</p>
      <div class="reg-fields__working-hours-grid">
        <AppInput v-model="model.workingHoursStart" type="time" label="Սկիզբ" />
        <AppInput v-model="model.workingHoursEnd" type="time" label="Ավարտ" />
      </div>
      <p v-if="errors.workingHours" class="reg-fields__error" role="alert">
        {{ errors.workingHours }}
      </p>
    </div>
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">Գներ (ոչ պարտադիր)</legend>
    <p class="reg-fields__note">
      Այս հատվածը լրացնելով և մրցունակ գին նշելով՝ կարող եք ավելացնել ձեր պատվերների քանակը։ Ձեր
      էջում կցուցադրվեն միայն լրացված դաշտերը։
    </p>
    <div class="reg-fields__grid">
      <AppInput
        v-model="model.priceCityCallout"
        label="Քաղաքում կանչ (Դ)"
        type="number"
        placeholder="10000"
        :error="errors.priceCityCallout"
      />
      <AppInput
        v-model="model.pricePerKm"
        label="Միջքաղաքային տեղափոխում (Դ/կմ)"
        type="number"
        placeholder="300"
        :error="errors.pricePerKm"
      />
      <AppInput
        v-model="model.priceWaitingPerHour"
        label="Սպասում (Դ/ժամ)"
        type="number"
        placeholder="3000"
        :error="errors.priceWaitingPerHour"
      />
      <AppInput
        v-model="model.priceNightSurchargePercent"
        label="Գիշերային ծառայություն (+%)"
        type="number"
        placeholder="20"
        :error="errors.priceNightSurchargePercent"
      />
      <AppInput
        v-model="model.priceExtraLoading"
        label="Բարդ բեռնում (+Դ)"
        type="number"
        placeholder="5000"
        :error="errors.priceExtraLoading"
      />
    </div>
  </fieldset>
</template>

<style scoped lang="scss">
.reg-fields {
  &__section {
    border: none;
    margin: 0;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  &__legend {
    font-size: 1.15rem;
    font-weight: 700;
    padding: 0;
    margin-bottom: var(--space-4);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }

  &__phone-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__phone-hint {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--color-text-muted);
  }

  &__checks {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);
    margin-top: var(--space-4);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }

  &__working-hours {
    margin-top: var(--space-4);
    max-width: 360px;
  }

  &__working-hours-label {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 var(--space-2);
  }

  &__working-hours-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  &__type-hint {
    display: block;

    strong {
      display: block;
    }

    & + & {
      margin-top: var(--space-2);
    }
  }

  &__note {
    margin: calc(-1 * var(--space-2)) 0 var(--space-4);
    font-size: 1rem;
    color: var(--color-text-muted);
  }

  &__error {
    color: var(--color-danger);
    font-size: 0.9rem;
    margin-bottom: var(--space-3);
  }
}
</style>
