<script setup lang="ts">
import { serviceCategoriesFor, withService } from '~/constants/services'
import {
  coverageModeOptions as buildCoverageModeOptions,
  hasUncappedCoverage,
  uncappedCoverageReason,
  type CoverageMode,
} from '~/constants/serviceAreaLimits'
import {
  asksDoubleDeck,
  asksTowHitch,
  asksWheelSkates,
  CAPACITY_RANGE_OPTIONS,
  specialistSpecFieldsFor,
  usesExactCapacity,
  VEHICLE_TYPE_OPTIONS,
} from '~/constants/vehicles'
import type { SelectOption } from '~/types/common'
import { ServiceType, VehicleType } from '~/types/enums'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import {
  isAvailable247,
  isManipulatorVehicleType,
  syncVehicleDependentFields,
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

const { t, locale } = useI18n()
const { vehicleTypeLabel, vehicleTypeHint, capacityRangeLabel, specFieldLabel, specFieldUnit } =
  useCatalogLabels()

const is247 = computed(() => isAvailable247(model.value.services))
const isManipulatorType = computed(() => isManipulatorVehicleType(model.value.vehicleType))
const isHeavyDutyType = computed(() => model.value.vehicleType === VehicleType.HeavyDuty)

/**
 * Which service questions this driver gets, and which technical ones.
 *
 * Both switch on the vehicle TYPE alone. A manipulator that also moves heavy
 * machinery is still asked for a crane rating, not a transporter's loading
 * height — see `SPECIALIST_SPEC_FIELDS` and `serviceCategoriesFor`.
 */
const serviceCategories = computed(() => serviceCategoriesFor(model.value.vehicleType))
const specFields = computed(() => specialistSpecFieldsFor(model.value.vehicleType))
const showCapacityBand = computed(() => !usesExactCapacity(model.value.vehicleType))
const showWheelSkates = computed(() => asksWheelSkates(model.value.vehicleType))
const showDoubleDeck = computed(() => asksDoubleDeck(model.value.vehicleType))
const showTowHitch = computed(() => asksTowHitch(model.value.vehicleType))

/** «Հաշիվ-ապրանքագիր» as a plain boolean over one slug in `services` */
const providesInvoice = computed<boolean>({
  get: () => model.value.services.includes(ServiceType.InvoiceProvided),
  set: (value) => {
    model.value.services = withService(model.value.services, ServiceType.InvoiceProvided, value)
  },
})

/** Whether this driver gets the nationwide coverage choice — see hasUncappedCoverage */
const uncapped = computed(() => hasUncappedCoverage(model.value))
const uncappedReason = computed(() => uncappedCoverageReason(model.value, locale.value))

/**
 * Which of the two specialist landing pages «Ամբողջ Հայաստան» actually puts
 * this driver on — the same union `hasUncappedCoverage` checks, read apart
 * instead of collapsed into one boolean.
 *
 * `uncapped` is true for four different reasons (pure manipulator, pure
 * heavy-duty, a flatbed with the crane checkbox, a flatbed with the heavy-load
 * checkbox), and only the first and third put a driver on `/manipulator` —
 * the note below used to name both pages unconditionally, which told a driver
 * who is only going on one of them that they would appear somewhere they
 * would not.
 */
const appearsOnManipulatorPages = computed(() => isManipulatorType.value || model.value.manipulator)
const appearsOnHeavyDutyPages = computed(() => isHeavyDutyType.value || model.value.heavyEquipment)

const nationwideVisibilityNote = computed(() => {
  if (appearsOnManipulatorPages.value && appearsOnHeavyDutyPages.value) {
    return t('registrationFields.nationwideNoteBoth')
  }
  if (appearsOnManipulatorPages.value) {
    return t('registrationFields.nationwideNoteManipulator')
  }
  return t('registrationFields.nationwideNoteHeavyDuty')
})

/**
 * The two coverage answers, as one control over one boolean.
 *
 * `servesAllArmenia` is the stored shape (see the column's comment for why
 * "everywhere" is not eleven region rows), and this is the only place the
 * driver's choice touches it. Switching to «Ամբողջ Հայաստան» does NOT clear the
 * marzes they had ticked: changing your mind back should not cost you the list,
 * and `buildRegistrationPayload` ignores it while the flag is on — the same
 * treatment the working-hours pair gets under «24/7».
 */
const coverageMode = computed<CoverageMode>({
  get: () => (model.value.servesAllArmenia ? 'all-armenia' : 'regions'),
  set: (value) => {
    model.value.servesAllArmenia = value === 'all-armenia'
  },
})

// If the driver switches to 24/7 after picking custom hours, clear them so a
// stale value never gets left behind — `buildRegistrationPayload` ignores them
// while is247 is true anyway, but empty fields are less confusing to look at.
watch(is247, (value) => {
  if (value) {
    model.value.workingHoursStart = ''
    model.value.workingHoursEnd = ''
  }
})

/**
 * One watcher for every consequence of "the vehicle changed".
 *
 * The rules live in `syncVehicleDependentFields` rather than here so the driver
 * dashboard applies exactly the same ones — this component is shared by
 * registration and the admin review page, but not by the dashboard, and the
 * three must not diverge (CLAUDE.md § "Registration and the driver dashboard
 * must offer the same fields").
 *
 * Watching all three inputs, not just the type: ticking «Ծանր տեխնիկայի
 * տեղափոխում» on a flatbed is what unlocks the nationwide coverage choice, and
 * unticking it has to take it away again — otherwise an unreachable `true`
 * publishes coverage nobody can see to remove.
 */
watch(
  () => [model.value.vehicleType, model.value.manipulator, model.value.heavyEquipment],
  () => syncVehicleDependentFields(model.value),
)

const vehicleTypeOptions = computed<SelectOption[]>(() =>
  VEHICLE_TYPE_OPTIONS.map((option) => ({
    value: option.value as string,
    label: vehicleTypeLabel(option.value),
  })),
)

/** `readonly` tuple → the mutable `SelectOption[]` AppSelect expects */
const coverageModeOptions = computed<SelectOption[]>(() => buildCoverageModeOptions(locale.value))

const vehicleTypeHints = computed(() =>
  VEHICLE_TYPE_OPTIONS.map((option) => ({
    label: vehicleTypeLabel(option.value),
    description: vehicleTypeHint(option.value),
  })),
)

/** `CAPACITY_RANGE_OPTIONS`, localized — the capacity-band select below */
const capacityBandOptions = computed<SelectOption[]>(() =>
  CAPACITY_RANGE_OPTIONS.map((option) => ({
    value: option.value,
    label: capacityRangeLabel(option.value),
  })),
)

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
    <legend class="reg-fields__legend">{{ t('registrationFields.personalDataLegend') }}</legend>
    <div class="reg-fields__grid">
      <AppInput
        v-model="model.firstName"
        :label="t('registrationFields.firstNameLabel')"
        required
        :error="errors.firstName"
      />
      <AppInput
        v-model="model.lastName"
        :label="t('registrationFields.lastNameLabel')"
        required
        :error="errors.lastName"
      />
      <AppInput v-model="model.companyName" :label="t('registrationFields.companyNameLabel')" />
      <div class="reg-fields__phone-field">
        <AppInput
          v-model="phoneModel"
          :label="t('registrationFields.phoneLabel')"
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
          {{ t('registrationFields.phoneHint') }}
        </p>
      </div>
      <AppInput
        v-model="secondaryPhoneModel"
        :label="t('registrationFields.secondaryPhoneLabel')"
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
    </div>
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">{{ t('registrationFields.vehicleDataLegend') }}</legend>
    <div class="reg-fields__grid">
      <AppInput
        v-model="model.brand"
        :label="t('registrationFields.brandLabel')"
        placeholder="Isuzu"
        required
        :error="errors.brand"
      />
      <AppInput
        v-model="model.model"
        :label="t('registrationFields.modelLabel')"
        placeholder="NPR 75"
      />
      <AppInput
        v-model="model.year"
        :label="t('registrationFields.yearLabel')"
        type="number"
        placeholder="2018"
        required
        :error="errors.year"
      />
      <AppSelect
        v-model="model.vehicleType"
        :options="vehicleTypeOptions"
        :label="t('registrationFields.typeLabel')"
        :error="errors.vehicleType"
      >
        <template #label-suffix>
          <AppTooltip :label="t('registrationFields.typeTooltipLabel')">
            <span v-for="hint in vehicleTypeHints" :key="hint.label" class="reg-fields__type-hint">
              <strong>{{ hint.label }}</strong>
              {{ hint.description }}
            </span>
          </AppTooltip>
        </template>
      </AppSelect>
      <!-- The band and the exact tonnage are the same question. A specialist
           states a real figure below instead, so showing both would ask twice
           and store the vaguer answer — see `usesExactCapacity`. -->
      <AppSelect
        v-if="showCapacityBand"
        v-model="model.capacity"
        :options="capacityBandOptions"
        :label="t('registrationFields.capacityBandLabel')"
        :error="errors.capacity"
      />
      <!-- Driven by SPECIALIST_SPEC_FIELDS, not written out per type: adding a
           technical question to a specialist vehicle is then one entry in that
           constant and it appears on the registration form, the admin review
           page and the dashboard at once. -->
      <AppInput
        v-for="field in specFields"
        :key="field.key"
        v-model="model[field.key]"
        :label="`${specFieldLabel(field.key, model.vehicleType, field.label)} (${specFieldUnit(field.unit)})${field.required ? ' *' : ''}`"
        type="number"
        :placeholder="field.placeholder"
        :error="errors[field.key]"
      />
      <PlatformDimensionsInput
        v-model:length="model.platformLengthM"
        v-model:width="model.platformWidthM"
        :error="errors.platformDimensions"
      />
    </div>
    <div class="reg-fields__checks">
      <AppCheckbox v-model="model.winch" :label="t('registrationFields.winchLabel')" />
      <!-- Locked, not hidden: someone who picked the manipulator type should
           still SEE that the answer is yes, rather than wonder where the
           question went. -->
      <AppCheckbox
        v-model="model.manipulator"
        :label="t('registrationFields.manipulatorLabel')"
        :disabled="isManipulatorType"
      />
      <!-- «Ծանր տեխնիկայի տեղափոխում» is a SERVICE, not a vehicle type: any
           truck that can actually do it may offer it, which is why it sits with
           the equipment checkboxes rather than in the type select. Ticking it
           is a request — a moderator confirms it on the review page before the
           truck appears on /tsanr-tehnika (see RegistrationProfileDto).

           Locked for «Ծանր տեխնիկայի էվակուատոր» exactly as «Ունի
           մանիպուլյատոր» is locked for the manipulator type: choosing that type
           has already answered this, and asking twice is what let the two
           disagree the first time round. -->
      <AppCheckbox
        v-model="model.heavyEquipment"
        :label="t('registrationFields.heavyEquipmentLabel')"
        :disabled="isHeavyDutyType"
      >
        <template #label-suffix>
          <AppTooltip :label="t('registrationFields.heavyEquipmentTooltipLabel')">
            {{ t('registrationFields.heavyEquipmentTooltipText') }}
          </AppTooltip>
        </template>
      </AppCheckbox>
      <!-- Skates are for rolling a car with locked wheels onto a platform. A
           manipulator lifts by crane and a transporter is loaded onto a low
           deck, so for those two the question has no answer — see
           `asksWheelSkates`. -->
      <AppCheckbox
        v-if="showWheelSkates"
        v-model="model.wheelSkates"
        :label="t('registrationFields.wheelSkatesLabel')"
      >
        <template #label-suffix>
          <AppTooltip :label="t('registrationFields.wheelSkatesTooltipLabel')">
            {{ t('registrationFields.wheelSkatesTooltipText') }}
          </AppTooltip>
        </template>
      </AppCheckbox>
      <!-- A two-tier deck carries two cars at once, which is a question only
           the two ordinary evacuators can answer — a crane truck lifts one
           vehicle and a transporter carries one machine. See `asksDoubleDeck`
           (its own predicate, not `asksWheelSkates`, for the reason set out
           there). -->
      <AppCheckbox
        v-if="showDoubleDeck"
        v-model="model.doubleDeck"
        :label="t('registrationFields.doubleDeckLabel')"
      >
        <template #label-suffix>
          <AppTooltip :label="t('registrationFields.doubleDeckTooltipLabel')">
            {{ t('registrationFields.doubleDeckTooltipText') }}
          </AppTooltip>
        </template>
      </AppCheckbox>
      <!-- Own predicate, not `showDoubleDeck` — see `asksTowHitch`. -->
      <AppCheckbox
        v-if="showTowHitch"
        v-model="model.towHitch"
        :label="t('registrationFields.towHitchLabel')"
      >
        <template #label-suffix>
          <AppTooltip :label="t('registrationFields.towHitchTooltipLabel')">
            {{ t('registrationFields.towHitchTooltipText') }}
          </AppTooltip>
        </template>
      </AppCheckbox>
    </div>
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">{{ t('registrationFields.areasLegend') }}</legend>

    <!-- Two different questions, because two different jobs.

         A roadside evacuator is asked for CITIES with a budget and a distance
         warning: someone next to a broken car needs a driver who will actually
         come, and a listing claiming everywhere is worth nothing to them.

         A crane truck or a machinery transporter is dispatched against a booked
         job at an agreed price, so «Ամբողջ Հայաստան» is an honest answer and
         capping it just empties the specialist pages. See
         `hasUncappedCoverage`. -->
    <template v-if="uncapped">
      <p class="reg-fields__note">{{ uncappedReason }}</p>
      <!-- Chips, not a dropdown: the choice is between two options and it
           changes what the rest of this section asks, so hiding the
           alternative behind a menu hides the reason the marz picker appears
           and disappears. See AppChoiceChips. -->
      <AppChoiceChips
        v-model="coverageMode"
        :options="coverageModeOptions"
        :label="t('registrationFields.coverageAreaLabel')"
        name="reg-coverage-mode"
        class="reg-fields__coverage-mode"
      />
      <p v-if="model.servesAllArmenia" class="reg-fields__note">
        {{ nationwideVisibilityNote }}
      </p>
      <!-- No city list and no budget: an uncapped driver picks marzes, and the
           marz itself is stored as the served area (`type: 'region'`). -->
      <ServiceRegionPicker
        v-else
        v-model="model.regionSlugs"
        :error="errors.regionSlugs || errors.citySlugs"
      />
    </template>

    <template v-else>
      <p class="reg-fields__note">
        {{ t('registrationFields.citiesNoteText1') }}
      </p>
      <p class="reg-fields__note">
        {{ t('registrationFields.citiesNoteText2') }}
      </p>
      <!-- Same component the dashboard uses, so what can be picked here and what
           can be changed later can never drift apart. -->
      <ServiceAreaPicker
        v-model:regions="model.regionSlugs"
        v-model:cities="model.citySlugs"
        :regions-error="errors.regionSlugs"
        :cities-error="errors.citySlugs"
      />
    </template>
  </fieldset>

  <!-- Its own section rather than a field inside "Տարածքներ": the areas above
       are where a driver is willing to GO, this is where they actually ARE, and
       the two answers get confused when they share a heading. Same component
       the dashboard and admin dialogs use. -->
  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">{{ t('registrationFields.locationLegend') }}</legend>
    <!-- The one section that may be skipped. It asks for a value copied out of
         Google Maps on a phone, which is the step most likely to end a
         registration — and the value is editable from the dashboard the moment
         a driver is approved, so blocking on it trades a whole driver for one
         field. `required: false` also switches the note at the bottom of the
         block from "paste the example number" to "leave it blank", which is the
         only honest advice once it is optional. -->
    <CoordinatesInput
      v-model="model.coordinates"
      :heading="t('registrationFields.locationHeading')"
      :required="false"
      :show-guidance="showCoordinateGuidance"
      :error="errors.coordinates"
    />
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">{{ t('registrationFields.servicesLegend') }}</legend>
    <p v-if="errors.services" class="reg-fields__error" role="alert">{{ errors.services }}</p>
    <ServiceCategoryPicker v-model="model.services" :categories="serviceCategories" mode="form" />

    <!-- Outside the payment group on purpose: an invoice is a document you
         hand over afterwards, not a fifth way to be paid. See
         `STANDALONE_SERVICES`. -->
    <div class="reg-fields__standalone">
      <AppCheckbox v-model="providesInvoice" :label="t('registrationFields.invoiceLabel')">
        <template #label-suffix>
          <AppTooltip :label="t('registrationFields.invoiceTooltipLabel')">
            {{ t('registrationFields.invoiceTooltipText') }}
          </AppTooltip>
        </template>
      </AppCheckbox>
    </div>

    <div v-if="!is247" class="reg-fields__working-hours">
      <p class="reg-fields__working-hours-label">{{ t('registrationFields.workingHoursLabel') }}</p>
      <div class="reg-fields__working-hours-grid">
        <AppInput
          v-model="model.workingHoursStart"
          type="time"
          :label="t('registrationFields.workingHoursStartLabel')"
        />
        <AppInput
          v-model="model.workingHoursEnd"
          type="time"
          :label="t('registrationFields.workingHoursEndLabel')"
        />
      </div>
      <p v-if="errors.workingHours" class="reg-fields__error" role="alert">
        {{ errors.workingHours }}
      </p>
    </div>
  </fieldset>

  <fieldset class="reg-fields__section">
    <legend class="reg-fields__legend">{{ t('registrationFields.pricesLegend') }}</legend>
    <p class="reg-fields__note">
      {{ t('registrationFields.pricesNote') }}
    </p>
    <div class="reg-fields__grid">
      <AppInput
        v-model="model.priceCityCallout"
        :label="t('registrationFields.priceCityCalloutLabel')"
        type="number"
        placeholder="10000"
        :error="errors.priceCityCallout"
      />
      <AppInput
        v-model="model.pricePerKm"
        :label="t('registrationFields.pricePerKmLabel')"
        type="number"
        placeholder="300"
        :error="errors.pricePerKm"
      />
      <AppInput
        v-model="model.priceWaitingPerHour"
        :label="t('registrationFields.priceWaitingLabel')"
        type="number"
        placeholder="3000"
        :error="errors.priceWaitingPerHour"
      />
      <AppInput
        v-model="model.priceNightSurchargePercent"
        :label="t('registrationFields.priceNightSurchargeLabel')"
        type="number"
        placeholder="20"
        :error="errors.priceNightSurchargePercent"
      />
      <AppInput
        v-model="model.priceExtraLoading"
        :label="t('registrationFields.priceExtraLoadingLabel')"
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

  &__standalone {
    margin-top: var(--space-4);
  }

  &__coverage-mode {
    max-width: 360px;
    margin-bottom: var(--space-4);
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
