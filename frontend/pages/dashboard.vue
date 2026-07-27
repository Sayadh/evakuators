<script setup lang="ts">
import { SERVICE_CATEGORIES } from '~/constants/services'
import { SITE_NAME } from '~/constants/site'
import { imageRepository, myTowTruckRepository, type UpdateMyTowTruckPayload } from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { ServiceType } from '~/types/enums'
import type { TowTruck } from '~/types/towTruck'
import { extractErrorMessage } from '~/utils/errors'
import { formatWorkingHoursRange, splitWorkingHoursRange } from '~/utils/workingHours'

useSeoMetaData({
  title: `Իմ պրոֆիլը | ${SITE_NAME}`,
  description: 'Խմբագրեք ձեր էվակուատորի պրոֆիլը։',
  path: '/dashboard',
  noindex: true,
})

const driverAuth = useDriverAuthStore()

if (import.meta.client && !driverAuth.isLoggedIn) {
  await navigateTo('/login')
}

const truck = ref<TowTruck | null>(null)
const loading = ref(true)
const loadError = ref('')

const form = reactive({
  secondaryPhone: '',
  whatsapp: '',
  telegram: '',
  email: '',
  description: '',
  services: [] as ServiceType[],
  workingHoursStart: '',
  workingHoursEnd: '',
  priceCityCallout: '',
  pricePerKm: '',
  priceWaitingPerHour: '',
  priceNightSurchargePercent: '',
  priceExtraLoading: '',
})

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)

const existingImages = ref<{ id: number; url: string }[]>([])
const newImageFiles = shallowRef<File[]>([])
const newImagePreviews = ref<string[]>([])

function removeExistingImage(index: number): void {
  existingImages.value.splice(index, 1)
}

function onNewImagesChange(event: Event): void {
  const input = event.target as HTMLInputElement
  let files = Array.from(input.files ?? [])
  
  const currentTotal = existingImages.value.length + newImageFiles.value.length
  const allowed = 6 - currentTotal
  
  if (allowed <= 0) {
    if (input) input.value = ''
    return
  }
  
  if (files.length > allowed) {
    files = files.slice(0, allowed)
  }

  newImageFiles.value.push(...files)

  const previews = files.map((file) => URL.createObjectURL(file))
  newImagePreviews.value.push(...previews)

  if (input) input.value = ''
}

function removeNewImage(index: number): void {
  URL.revokeObjectURL(newImagePreviews.value[index])
  newImageFiles.value.splice(index, 1)
  newImagePreviews.value.splice(index, 1)
}

onBeforeUnmount(() => {
  newImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
})

function fillFormFromTruck(data: TowTruck): void {
  form.secondaryPhone = data.secondaryPhone ?? ''
  form.whatsapp = data.whatsapp ?? ''
  form.telegram = data.telegram ?? ''
  form.email = data.email ?? ''
  form.description = data.description
  form.services = [...data.services]
  const { start, end } = splitWorkingHoursRange(data.workingHoursText)
  form.workingHoursStart = start
  form.workingHoursEnd = end
  form.priceCityCallout = data.pricing?.cityCallout?.toString() ?? ''
  form.pricePerKm = data.pricing?.perKm?.toString() ?? ''
  form.priceWaitingPerHour = data.pricing?.waitingPerHour?.toString() ?? ''
  form.priceNightSurchargePercent = data.pricing?.nightSurchargePercent?.toString() ?? ''
  form.priceExtraLoading = data.pricing?.extraLoading?.toString() ?? ''
  existingImages.value = data.imageDetails ? [...data.imageDetails] : []
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    truck.value = await myTowTruckRepository.getMine()
    fillFormFromTruck(truck.value)
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Պրոֆիլը բեռնել չհաջողվեց։ Կրկին մուտք գործեք։')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (driverAuth.isLoggedIn) void load()
})

const is247 = computed(() => form.services.includes(ServiceType.Available247))

function toOptionalInt(value: string): number | undefined {
  const trimmed = value.trim()
  return trimmed ? Number(trimmed) : undefined
}

async function submit(): Promise<void> {
  saveError.value = ''
  saveSuccess.value = false

  // Fully optional — a driver may leave both 24/7 unselected and hours
  // unset. Only flag it when exactly one of the two times got filled in,
  // since that combination can't be saved as a valid range either way.
  if (Boolean(form.workingHoursStart) !== Boolean(form.workingHoursEnd)) {
    saveError.value = 'Լրացրեք և՛ սկիզբը, և՛ ավարտը, կամ թողեք երկուսն էլ դատարկ'
    return
  }

  saving.value = true
  try {
    const hasFullHours = Boolean(form.workingHoursStart) && Boolean(form.workingHoursEnd)
    const payload: UpdateMyTowTruckPayload = {
      secondaryPhone: form.secondaryPhone.trim() || undefined,
      whatsapp: form.whatsapp.trim() || undefined,
      telegram: form.telegram.trim() || undefined,
      email: form.email.trim() || undefined,
      description: form.description.trim(),
      services: form.services,
      workingHoursText:
        is247.value || !hasFullHours
          ? undefined
          : formatWorkingHoursRange(form.workingHoursStart, form.workingHoursEnd),
      priceCityCallout: toOptionalInt(form.priceCityCallout),
      pricePerKm: toOptionalInt(form.pricePerKm),
      priceWaitingPerHour: toOptionalInt(form.priceWaitingPerHour),
      priceNightSurchargePercent: toOptionalInt(form.priceNightSurchargePercent),
      priceExtraLoading: toOptionalInt(form.priceExtraLoading),
    }

    if (newImageFiles.value.length > 0) {
      const uploaded = []
      for (const file of newImageFiles.value) {
        uploaded.push(await imageRepository.upload(file))
      }
      payload.imageIds = [
        ...existingImages.value.map((i) => i.id),
        ...uploaded.map((i) => i.id),
      ]
    } else {
      payload.imageIds = existingImages.value.map((i) => i.id)
    }

    truck.value = await myTowTruckRepository.updateMine(payload)
    fillFormFromTruck(truck.value)
    saveSuccess.value = true
    newImageFiles.value = []
    newImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
    newImagePreviews.value = []
  } catch (error) {
    saveError.value = extractErrorMessage(error, 'Պահպանել չհաջողվեց, ստուգիր դաշտերը։')
  } finally {
    saving.value = false
  }
}

async function logout(): Promise<void> {
  driverAuth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="container dashboard-page">
    <header class="dashboard-header">
      <h1>Իմ պրոֆիլը</h1>
      <AppButton variant="outline" size="sm" @click="logout">Դուրս գալ</AppButton>
    </header>

    <LoadingSkeleton v-if="loading" variant="text" :count="5" />

    <p v-else-if="loadError" class="dashboard-error">{{ loadError }}</p>

    <template v-else-if="truck">
      <p class="dashboard-hint">
        <strong>{{ truck.driverName }}</strong> · {{ truck.vehicle.brand }}
        {{ truck.vehicle.model }} · <NuxtLink :to="`/tow-trucks/${truck.slug}`">Տեսնել պրոֆիլը կայքում</NuxtLink>
      </p>

      <!-- Analytics first: it's what a driver opens the dashboard to check, and
           it needs no interaction. The edit form stays below it. -->
      <section class="dashboard-section dashboard-section--analytics">
        <AnalyticsDashboard scope="driver" />
      </section>

      <form class="dashboard-form" @submit.prevent="submit">
        <fieldset class="dashboard-section">
          <legend>Կոնտակտներ</legend>
          <AppInput v-model="form.secondaryPhone" type="tel" label="Լրացուցիչ հեռախոս" />
          <AppInput v-model="form.whatsapp" type="tel" label="WhatsApp" />
          <AppInput v-model="form.telegram" label="Telegram username" />
          <AppInput v-model="form.email" type="email" label="Email" />
        </fieldset>

        <fieldset class="dashboard-section">
          <legend>Նկարագրություն</legend>
          <AppInput v-model="form.description" label="Նկարագրություն" />
        </fieldset>

        <fieldset class="dashboard-section">
          <legend>Ծառայություններ</legend>
          <ServiceCategoryPicker v-model="form.services" :categories="SERVICE_CATEGORIES" mode="form" />
          <div v-if="!is247" class="dashboard-working-hours">
            <p class="dashboard-working-hours__label">Աշխատանքային ժամեր (ոչ պարտադիր)</p>
            <div class="dashboard-working-hours__grid">
              <AppInput v-model="form.workingHoursStart" type="time" label="Սկիզբ" />
              <AppInput v-model="form.workingHoursEnd" type="time" label="Ավարտ" />
            </div>
          </div>
        </fieldset>

        <fieldset class="dashboard-section">
          <legend>Գներ (ոչ պարտադիր)</legend>
          <AppInput v-model="form.priceCityCallout" type="number" label="Քաղաքի ներսում (֏)" />
          <AppInput v-model="form.pricePerKm" type="number" label="1 կմ-ի գին (֏)" />
          <AppInput v-model="form.priceWaitingPerHour" type="number" label="Սպասում, ժամում (֏)" />
          <AppInput
            v-model="form.priceNightSurchargePercent"
            type="number"
            label="Գիշերային հավելավճար (%)"
          />
          <AppInput v-model="form.priceExtraLoading" type="number" label="Լրացուցիչ բարձում (֏)" />
        </fieldset>

        <fieldset class="dashboard-section">
          <legend>Նկարներ</legend>
          <div class="dashboard-images">
            <!-- Existing images -->
            <div
              v-for="(image, index) in existingImages"
              :key="'existing-' + image.id"
              class="dashboard-image-wrap"
            >
              <img :src="image.url" alt="" class="dashboard-image" >
              <button
                type="button"
                class="dashboard-image-remove"
                aria-label="Հեռացնել նկարը"
                @click="removeExistingImage(index)"
              >
                <AppIcon name="close" :size="14" />
              </button>
            </div>
            
            <!-- New images previews -->
            <div
              v-for="(preview, index) in newImagePreviews"
              :key="'new-' + index"
              class="dashboard-image-wrap"
            >
              <img :src="preview" alt="" class="dashboard-image" >
              <button
                type="button"
                class="dashboard-image-remove"
                aria-label="Հեռացնել նկարը"
                @click="removeNewImage(index)"
              >
                <AppIcon name="close" :size="14" />
              </button>
            </div>
          </div>
          
          <div class="dashboard-file-input" v-if="existingImages.length + newImageFiles.length < 6">
            <label for="new-images">Ավելացնել նկարներ (մինչև 6 նկար)</label>
            <input
              id="new-images"
              type="file"
              accept="image/*"
              multiple
              @change="onNewImagesChange"
            >
          </div>
          <div v-else class="dashboard-file-input">
            <label>Նկարների առավելագույն քանակը (6) լրացված է։</label>
          </div>
        </fieldset>


        <p v-if="saveError" class="dashboard-error">{{ saveError }}</p>
        <p v-if="saveSuccess" class="dashboard-success">Հաջողությամբ պահպանվեց ✓</p>

        <AppButton type="submit" variant="success" block :disabled="saving">
          {{ saving ? 'Պահպանվում է…' : 'Պահպանել' }}
        </AppButton>
      </form>

      <section class="dashboard-section dashboard-section--routes">
        <h2>Ազատ երթուղիներ</h2>
        <p class="dashboard-hint">
          Մեկնում եք ինչ-որ ուղղությամբ դատարկ։ Հրապարակեք երթուղին, և հաճախորդները, ովքեր շարժվում
          են նույն ուղղությամբ, կկարողանան կապվել ձեզ հետ։
        </p>
        <FreeRoutesManager :vehicle-type="truck.vehicle.type" />
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.dashboard-page {
  padding-top: var(--space-6);
  padding-bottom: var(--space-8);
  /* The edit form reads best in a narrow column, but charts and the six
     overview cards need room — so the page is wide and the form is capped
     instead (see .dashboard-form / .dashboard-section--routes below). */
  max-width: 960px;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.dashboard-hint {
  color: var(--color-text-secondary);
  margin-bottom: var(--space-5);
}

.dashboard-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 640px;
}

.dashboard-section--analytics {
  border: 0;
  padding: 0;
  margin-bottom: var(--space-6);
}

.dashboard-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);

  legend {
    font-weight: 600;
    padding: 0 var(--space-2);
  }
}

.dashboard-section--routes {
  margin-top: var(--space-6);
  max-width: 640px;

  h2 {
    margin: 0;
  }

  .dashboard-hint {
    margin-bottom: 0;
  }
}

.dashboard-working-hours {
  &__label {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 var(--space-2);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
    max-width: 360px;
  }
}

.dashboard-error {
  color: var(--color-danger);
}

.dashboard-success {
  color: var(--color-success);
}

.dashboard-images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.dashboard-image-wrap {
  position: relative;
  width: 96px;
}

.dashboard-image {
  display: block;
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
}

.dashboard-image-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  background: var(--color-danger);
  color: #fff;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background var(--transition);

  &:hover {
    background: #c0392b;
  }
}

.dashboard-file-input {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  
  label {
    font-size: 0.9rem;
    font-weight: 600;
  }
}
</style>
