<script setup lang="ts">
import { imageRepository, isApiEnabled, registrationRepository } from '~/repositories'
import { citiesService, districtsService } from '~/services'
import { SITE_NAME } from '~/constants/site'
import { SERVICE_LABELS } from '~/constants/services'
import {
  CAPACITY_RANGE_OPTIONS,
  VEHICLE_TYPE_DESCRIPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '~/constants/vehicles'
import { ServiceType, type VehicleType } from '~/types/enums'
import type { SelectOption } from '~/types/common'
import { trackRegistrationSubmit } from '~/utils/analytics'
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

const form = reactive({
  firstName: '',
  lastName: '',
  companyName: '',
  phone: '',
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
  works24Hours: false,
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
})

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

const allServices = Object.values(ServiceType)

function toggleService(service: ServiceType): void {
  form.services = form.services.includes(service)
    ? form.services.filter((item) => item !== service)
    : [...form.services, service]
}

const MAX_EXTRA_IMAGES = 5

const mainImageFile = shallowRef<File | null>(null)
const extraImageFiles = shallowRef<File[]>([])

function onMainImageChange(event: Event): void {
  const input = event.target as HTMLInputElement
  mainImageFile.value = input.files?.[0] ?? null
  form.mainImageName = mainImageFile.value?.name ?? ''
}

function onExtraImagesChange(event: Event): void {
  const input = event.target as HTMLInputElement
  extraImageFiles.value = Array.from(input.files ?? []).slice(0, MAX_EXTRA_IMAGES)
  form.extraImageNames = extraImageFiles.value.map((file) => file.name)
}

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
    return
  }

  isSubmitting.value = true
  try {
    await submitToApi()
    trackRegistrationSubmit()
    isSuccessOpen.value = true
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
            v-model="form.phone"
            label="Հիմնական հեռախոսահամար"
            type="tel"
            placeholder="+374 91 00 00 01"
            required
            :error="errors.phone"
          />
          <AppInput
            v-model="form.secondaryPhone"
            label="Երկրորդ հեռախոսահամար (ոչ պարտադիր)"
            type="tel"
            placeholder="+374 99 00 00 01"
            :error="errors.secondaryPhone"
          />
          <AppInput
            v-model="form.whatsapp"
            label="WhatsApp"
            type="tel"
            placeholder="+374 91 00 00 01"
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
            label="Առավելագույն բեռնատարողություն"
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
          <AppCheckbox v-model="form.works24Hours" label="Աշխատում է 24/7" />
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
        <div class="register__services">
          <AppCheckbox
            v-for="service in allServices"
            :key="service"
            :model-value="form.services.includes(service)"
            :label="SERVICE_LABELS[service]"
            @update:model-value="toggleService(service)"
          />
        </div>
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
            <input id="main-image" type="file" accept="image/*" @change="onMainImageChange" >
            <span v-if="form.mainImageName" class="register__file-name">{{ form.mainImageName }}</span>
            <p v-if="errors.mainImage" class="register__error" role="alert">
              {{ errors.mainImage }}
            </p>
          </div>
          <div class="register__file">
            <label for="extra-images">Լրացուցիչ նկարներ (մինչև {{ MAX_EXTRA_IMAGES }})</label>
            <input id="extra-images" type="file" accept="image/*" multiple @change="onExtraImagesChange" >
            <span v-if="form.extraImageNames.length" class="register__file-name">
              {{ form.extraImageNames.length }}/{{ MAX_EXTRA_IMAGES }} ֆայլ ընտրված է
            </span>
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
