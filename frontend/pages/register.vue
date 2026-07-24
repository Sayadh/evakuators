<script setup lang="ts">
import { imageRepository, isApiEnabled, registrationRepository } from '~/repositories'
import { citiesService, districtsService } from '~/services'
import { SITE_NAME } from '~/constants/site'
import { SERVICE_CATEGORIES } from '~/constants/services'
import {
  CAPACITY_RANGE_OPTIONS,
  VEHICLE_TYPE_DESCRIPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '~/constants/vehicles'
import type { ServiceType, VehicleType } from '~/types/enums'
import type { SelectOption } from '~/types/common'
import { trackRegistrationSubmit } from '~/utils/analytics'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import {
  isAmount,
  isEmail,
  isPercent,
  isPhone,
  isPlatformDimensions,
  isYear,
  required,
  validateField,
} from '~/utils/validators'

useSeoMetaData({
  title: `Գրանցել էվակուատոր | Միացեք հարթակին անվճար | ${SITE_NAME}`,
  description:
    'Գրանցեք ձեր էվակուատորը Evakuators.am հարթակում և ստացեք պատվերներ ձեր տարածքից։ Գրանցումն անվճար է։',
  path: '/register',
})

const { data: regions } = useRegions()

/** Factory (not a shared literal) so resetForm() below can get a fresh,
 * independent copy of the defaults after a successful submission. */
function createInitialFormState() {
  return {
    firstName: '',
    lastName: '',
    companyName: '',
    // Pre-filled and locked to the +374 prefix (see armenianPhoneModel below) —
    // the driver only ever types the 8 local digits.
    phone: '+374',
    secondaryPhone: '',
    whatsapp: '',
    telegram: '',
    email: '',
    brand: '',
    model: '',
    year: '',
    vehicleType: '' as VehicleType | '',
    capacity: '' as string,
    platformDimensions: '',
    winch: false,
    manipulator: false,
    mainRegionSlug: '',
    citySlugs: [] as string[],
    services: [] as ServiceType[],
    priceCityCallout: '',
    pricePerKm: '',
    priceWaitingPerHour: '',
    priceNightSurchargePercent: '',
    priceExtraLoading: '',
    mainImageName: '',
    extraImageNames: [] as string[],
  }
}

const form = reactive(createInitialFormState())

const errors = reactive<Record<string, string>>({})

const YEREVAN_SLUG = 'yerevan'

const regionOptions = computed<SelectOption[]>(() => [
  { value: YEREVAN_SLUG, label: 'Երևան' },
  ...regions.value.map((region) => ({ value: region.slug, label: region.name })),
])

const isYerevanSelected = computed(() => form.mainRegionSlug === YEREVAN_SLUG)

const cityOptions = ref<SelectOption[]>([])

watch(
  () => form.mainRegionSlug,
  async (regionSlug) => {
    form.citySlugs = []
    cityOptions.value = []
    if (!regionSlug) return

    if (regionSlug === YEREVAN_SLUG) {
      const districts = await districtsService.getDistricts()
      cityOptions.value = districts.map((district) => ({
        value: district.slug,
        label: district.name,
      }))
      return
    }

    const cities = await citiesService.getCitiesByRegionSlug(regionSlug)
    cityOptions.value = cities.map((city) => ({ value: city.slug, label: city.name }))
  },
)

function toggleCity(slug: string): void {
  form.citySlugs = form.citySlugs.includes(slug)
    ? form.citySlugs.filter((item) => item !== slug)
    : [...form.citySlugs, slug]
}

const isAllCitiesSelected = computed(
  () => cityOptions.value.length > 0 && form.citySlugs.length === cityOptions.value.length,
)

function toggleAllCities(): void {
  form.citySlugs = isAllCitiesSelected.value ? [] : cityOptions.value.map((option) => option.value)
}

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
    get: () => form[key],
    set: (value) => {
      form[key] = armenianPhoneInputValue(value)
    },
  })
}

const phoneModel = armenianPhoneModel('phone')
const secondaryPhoneModel = armenianPhoneModel('secondaryPhone')
const whatsappModel = armenianPhoneModel('whatsapp')

const MAX_EXTRA_IMAGES = 5

const mainImageInput = ref<HTMLInputElement | null>(null)
const extraImagesInput = ref<HTMLInputElement | null>(null)

const mainImageFile = shallowRef<File | null>(null)
const extraImageFiles = shallowRef<File[]>([])

// Local object URLs so the driver sees a thumbnail of what they picked
// before it's ever uploaded — revoked on replace/unmount to avoid leaking.
const mainImagePreview = ref<string | null>(null)
const extraImagePreviews = ref<string[]>([])

function onMainImageChange(event: Event): void {
  const input = event.target as HTMLInputElement
  mainImageFile.value = input.files?.[0] ?? null
  form.mainImageName = mainImageFile.value?.name ?? ''

  if (mainImagePreview.value) URL.revokeObjectURL(mainImagePreview.value)
  mainImagePreview.value = mainImageFile.value ? URL.createObjectURL(mainImageFile.value) : null
}

function onExtraImagesChange(event: Event): void {
  const input = event.target as HTMLInputElement
  extraImageFiles.value = Array.from(input.files ?? []).slice(0, MAX_EXTRA_IMAGES)
  form.extraImageNames = extraImageFiles.value.map((file) => file.name)

  extraImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
  extraImagePreviews.value = extraImageFiles.value.map((file) => URL.createObjectURL(file))
}

onBeforeUnmount(() => {
  if (mainImagePreview.value) URL.revokeObjectURL(mainImagePreview.value)
  extraImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
})

function validate(): boolean {
  errors.firstName = validateField(form.firstName, [required()]) ?? ''
  errors.lastName = validateField(form.lastName, [required()]) ?? ''
  errors.phone = validateField(form.phone, [required(), isPhone()]) ?? ''
  errors.secondaryPhone = validateField(form.secondaryPhone, [isPhone()]) ?? ''
  errors.whatsapp = validateField(form.whatsapp, [isPhone()]) ?? ''
  errors.email = validateField(form.email, [isEmail()]) ?? ''
  errors.brand = validateField(form.brand, [required()]) ?? ''
  errors.year = validateField(form.year, [required(), isYear()]) ?? ''
  errors.vehicleType = validateField(form.vehicleType, [required('Ընտրեք մեքենայի տեսակը')]) ?? ''
  errors.capacity =
    validateField(form.capacity, [required('Ընտրեք առավելագույն բեռնատարողությունը')]) ?? ''
  errors.platformDimensions =
    validateField(form.platformDimensions, [isPlatformDimensions()]) ?? ''
  errors.mainRegionSlug = validateField(form.mainRegionSlug, [required('Ընտրեք մարզը')]) ?? ''
  errors.citySlugs =
    form.citySlugs.length === 0
      ? isYerevanSelected.value
        ? 'Ընտրեք առնվազն մեկ շրջան'
        : 'Ընտրեք առնվազն մեկ քաղաք'
      : ''
  errors.services =
    form.services.length === 0 ? 'Ընտրեք առնվազն մեկ ծառայություն' : ''
  errors.mainImage = form.mainImageName ? '' : 'Ավելացրեք գլխավոր նկարը'
  errors.priceCityCallout = validateField(form.priceCityCallout, [isAmount()]) ?? ''
  errors.pricePerKm = validateField(form.pricePerKm, [isAmount('Մուտքագրեք 1 կմ-ի գինը թվերով (օր.՝ 300)')]) ?? ''
  errors.priceWaitingPerHour = validateField(form.priceWaitingPerHour, [isAmount()]) ?? ''
  errors.priceNightSurchargePercent =
    validateField(form.priceNightSurchargePercent, [isPercent()]) ?? ''
  errors.priceExtraLoading = validateField(form.priceExtraLoading, [isAmount()]) ?? ''

  return Object.values(errors).every((error) => !error)
}

const isSuccessOpen = ref(false)
const isSubmitting = ref(false)
const submitError = ref('')

/** Wipes the whole form back to a blank state after a successful submission
 * — fields, validation errors, selected files/previews, and the native file
 * inputs themselves (clearing those needs a direct DOM reset, resetting the
 * reactive state alone doesn't change what the browser shows in the input). */
function resetForm(): void {
  Object.assign(form, createInitialFormState())
  Object.keys(errors).forEach((key) => {
    errors[key] = ''
  })

  mainImageFile.value = null
  extraImageFiles.value = []

  if (mainImagePreview.value) URL.revokeObjectURL(mainImagePreview.value)
  mainImagePreview.value = null
  extraImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
  extraImagePreviews.value = []

  if (mainImageInput.value) mainImageInput.value.value = ''
  if (extraImagesInput.value) extraImagesInput.value.value = ''

  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Uploads the images through the backend, then submits the request */
async function submitToApi(): Promise<void> {
  const files = [mainImageFile.value, ...extraImageFiles.value].filter(
    (file): file is File => file !== null,
  )
  const uploaded = []
  for (const file of files) {
    uploaded.push(await imageRepository.upload(file))
  }

  const payload = buildRegistrationPayload(form, uploaded.map((image) => image.id))
  await registrationRepository.submit(payload)
}

async function onSubmit(): Promise<void> {
  if (!validate()) {
    if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  submitError.value = ''

  if (!isApiEnabled()) {
    // No backend configured — demo mode simply confirms the submission
    trackRegistrationSubmit()
    isSuccessOpen.value = true
    resetForm()
    return
  }

  isSubmitting.value = true
  try {
    await submitToApi()
    trackRegistrationSubmit()
    isSuccessOpen.value = true
    resetForm()
  } catch {
    submitError.value = 'Չհաջողվեց ուղարկել հայտը։ Ստուգեք կապը և փորձեք կրկին։'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="container register">
    <h1>Գրանցել էվակուատոր</h1>
    <p class="register__intro">
      Լրացրեք ձեր և մեքենայի տվյալները, և ձեր պրոֆիլը կհայտնվի հարթակում ստուգումից հետո։ Գրանցումն
      անվճար է։
    </p>

    <form class="register__form" novalidate @submit.prevent="onSubmit">
      <fieldset class="register__section">
        <legend class="register__legend">Անձնական տվյալներ</legend>
        <div class="register__grid">
          <AppInput v-model="form.firstName" label="Անուն" required :error="errors.firstName" />
          <AppInput v-model="form.lastName" label="Ազգանուն" required :error="errors.lastName" />
          <AppInput v-model="form.companyName" label="Կազմակերպության անուն (եթե կա)" />
          <AppInput
            v-model="phoneModel"
            label="Հիմնական հեռախոսահամար"
            type="tel"
            placeholder="+37491000001"
            required
            :error="errors.phone"
          />
          <AppInput
            v-model="secondaryPhoneModel"
            label="Երկրորդ հեռախոսահամար (ոչ պարտադիր)"
            type="tel"
            placeholder="+37499000001"
            :error="errors.secondaryPhone"
          />
          <AppInput
            v-model="whatsappModel"
            label="WhatsApp"
            type="tel"
            placeholder="+37491000001"
            :error="errors.whatsapp"
          />
          <AppInput v-model="form.telegram" label="Telegram (username)" placeholder="@username" />
          <AppInput
            v-model="form.email"
            label="Email"
            type="email"
            placeholder="name@example.com"
            :error="errors.email"
          />
        </div>
      </fieldset>

      <fieldset class="register__section">
        <legend class="register__legend">Մեքենայի տվյալներ</legend>
        <div class="register__grid">
          <AppInput v-model="form.brand" label="Մակնիշ" placeholder="Isuzu" required :error="errors.brand" />
          <AppInput v-model="form.model" label="Մոդել (ոչ պարտադիր)" placeholder="NPR 75" />
          <AppInput v-model="form.year" label="Տարեթիվ" type="number" placeholder="2018" required :error="errors.year" />
          <AppSelect
            v-model="form.vehicleType"
            :options="vehicleTypeOptions"
            label="Տեսակ"
            :error="errors.vehicleType"
          >
            <template #label-suffix>
              <AppTooltip label="Էվակուատորի տեսակների բացատրություն">
                <span
                  v-for="hint in vehicleTypeHints"
                  :key="hint.label"
                  class="register__type-hint"
                >
                  <strong>{{ hint.label }}</strong>
                  {{ hint.description }}
                </span>
              </AppTooltip>
            </template>
          </AppSelect>
          <AppSelect
            v-model="form.capacity"
            :options="CAPACITY_RANGE_OPTIONS"
            label="Առավելագույն բեռնատարողություն *"
            :error="errors.capacity"
          />
          <AppInput
            v-model="form.platformDimensions"
            label="Հարթակի չափսեր (ոչ պարտադիր)"
            placeholder="5.5 մ × 2.2 մ"
            :error="errors.platformDimensions"
          />
        </div>
        <div class="register__checks">
          <AppCheckbox v-model="form.winch" label="Ունի ճախարակ (winch, лебедка)" />
          <AppCheckbox v-model="form.manipulator" label="Ունի մանիպուլյատոր" />
        </div>
      </fieldset>

      <fieldset class="register__section">
        <legend class="register__legend">Տարածքներ</legend>
        <div class="register__grid">
          <AppSelect
            v-model="form.mainRegionSlug"
            :options="regionOptions"
            label="Հիմնական մարզ"
            :error="errors.mainRegionSlug"
          />
        </div>

        <div v-if="cityOptions.length > 0" class="register__cities">
          <p class="register__cities-label">
            {{ isYerevanSelected ? 'Սպասարկվող շրջաններ' : 'Սպասարկվող քաղաքներ'
            }}<span class="register__required" aria-hidden="true"> *</span>
          </p>
          <p v-if="errors.citySlugs" class="register__error" role="alert">
            {{ errors.citySlugs }}
          </p>
          <AppCheckbox
            :model-value="isAllCitiesSelected"
            :label="isYerevanSelected ? 'Ամբողջ Երևանը' : 'Ամբողջ մարզը'"
            class="register__all-cities"
            @update:model-value="toggleAllCities"
          />
          <div class="register__cities-grid">
            <AppCheckbox
              v-for="option in cityOptions"
              :key="option.value"
              :model-value="form.citySlugs.includes(option.value)"
              :label="option.label"
              @update:model-value="toggleCity(option.value)"
            />
          </div>
        </div>
      </fieldset>

      <fieldset class="register__section">
        <legend class="register__legend">Ծառայություններ</legend>
        <p v-if="errors.services" class="register__error" role="alert">{{ errors.services }}</p>
        <ServiceCategoryPicker v-model="form.services" :categories="SERVICE_CATEGORIES" mode="form" />
      </fieldset>

      <fieldset class="register__section">
        <legend class="register__legend">Գներ (ոչ պարտադիր)</legend>
        <p class="register__note">
          Այս հատվածը լրացնելով և մրցունակ գին նշելով՝ կարող եք ավելացնել ձեր պատվերների քանակը։
          Ձեր էջում կցուցադրվեն միայն լրացված դաշտերը։
        </p>
        <div class="register__grid">
          <AppInput
            v-model="form.priceCityCallout"
            label="Քաղաքում կանչ (Դ)"
            type="number"
            placeholder="10000"
            :error="errors.priceCityCallout"
          />
          <AppInput
            v-model="form.pricePerKm"
            label="Միջքաղաքային տեղափոխում (Դ/կմ)"
            type="number"
            placeholder="300"
            :error="errors.pricePerKm"
          />
          <AppInput
            v-model="form.priceWaitingPerHour"
            label="Սպասում (Դ/ժամ)"
            type="number"
            placeholder="3000"
            :error="errors.priceWaitingPerHour"
          />
          <AppInput
            v-model="form.priceNightSurchargePercent"
            label="Գիշերային ծառայություն (+%)"
            type="number"
            placeholder="20"
            :error="errors.priceNightSurchargePercent"
          />
          <AppInput
            v-model="form.priceExtraLoading"
            label="Բարդ բեռնում (+Դ)"
            type="number"
            placeholder="5000"
            :error="errors.priceExtraLoading"
          />
        </div>
      </fieldset>

      <fieldset class="register__section">
        <legend class="register__legend">Նկարներ</legend>
        <div class="register__grid">
          <div class="register__file">
            <label for="main-image">
              Գլխավոր նկար<span class="register__required" aria-hidden="true"> *</span>
            </label>
            <input
              id="main-image"
              ref="mainImageInput"
              type="file"
              accept="image/*"
              @change="onMainImageChange"
            >
            <span v-if="form.mainImageName" class="register__file-name">{{ form.mainImageName }}</span>
            <img v-if="mainImagePreview" :src="mainImagePreview" alt="" class="register__image-preview" >
            <p v-if="errors.mainImage" class="register__error" role="alert">
              {{ errors.mainImage }}
            </p>
          </div>
          <div class="register__file">
            <label for="extra-images">Լրացուցիչ նկարներ (մինչև {{ MAX_EXTRA_IMAGES }})</label>
            <input
              id="extra-images"
              ref="extraImagesInput"
              type="file"
              accept="image/*"
              multiple
              @change="onExtraImagesChange"
            >
            <span v-if="form.extraImageNames.length" class="register__file-name">
              {{ form.extraImageNames.length }}/{{ MAX_EXTRA_IMAGES }} ֆայլ ընտրված է
            </span>
            <div v-if="extraImagePreviews.length" class="register__image-preview-grid">
              <img
                v-for="(preview, index) in extraImagePreviews"
                :key="index"
                :src="preview"
                alt=""
                class="register__image-preview"
              >
            </div>
          </div>
        </div>
      </fieldset>

      <p v-if="submitError" class="register__error" role="alert">{{ submitError }}</p>

      <AppButton
        type="submit"
        variant="accent"
        size="lg"
        block
        :disabled="isSubmitting"
        class="register__submit"
      >
        {{ isSubmitting ? 'Ուղարկվում է…' : 'Ուղարկել հայտը' }}
      </AppButton>
    </form>

    <AppModal v-model="isSuccessOpen" title="Հայտն ընդունված է">
      <p>
        Շնորհակալություն։ Ձեր հայտը հաջողությամբ ուղարկվել է։ Մեր թիմը կստուգի տվյալները և
        կակտիվացնի ձեր պրոֆիլը։
      </p>
      <AppButton variant="primary" block @click="isSuccessOpen = false">Լավ, հասկանալի է</AppButton>
    </AppModal>
  </div>
</template>

<style scoped lang="scss">
.register {
  padding-bottom: var(--space-7);
  max-width: 860px;

  &__intro {
    color: var(--color-text-secondary);
    max-width: 640px;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin-top: var(--space-5);
  }

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

  &__checks {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);
    margin-top: var(--space-4);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }

  &__services {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }

  &__cities {
    margin-top: var(--space-4);
  }

  &__cities-label {
    font-size: 0.9rem;
    font-weight: 600;
    margin-bottom: var(--space-2);
  }

  &__required {
    color: var(--color-danger);
  }

  &__all-cities {
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    font-weight: 700;
  }

  &__cities-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);

    @media (min-width: 640px) {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (min-width: 1024px) {
      grid-template-columns: repeat(3, 1fr);
    }
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

  &__file {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    label {
      font-size: 0.9rem;
      font-weight: 600;
    }

    input {
      font-size: 0.9rem;
    }
  }

  &__file-name {
    font-size: 0.82rem;
    color: var(--color-text-muted);
  }

  &__image-preview {
    width: 96px;
    height: 96px;
    object-fit: cover;
    border-radius: var(--radius-md, 10px);
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  }

  &__image-preview-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  &__note {
    margin: calc(-1 * var(--space-2)) 0 var(--space-4);
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  &__error {
    color: var(--color-danger);
    font-size: 0.9rem;
    margin-bottom: var(--space-3);
  }

  &__submit {
    @media (min-width: 640px) {
      align-self: flex-start;
      width: auto;
    }
  }
}
</style>
