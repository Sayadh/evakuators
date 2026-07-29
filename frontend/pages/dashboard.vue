<script setup lang="ts">
import { SERVICE_CATEGORIES } from '~/constants/services'
import { SITE_NAME } from '~/constants/site'
import { imageRepository, myTowTruckRepository, type UpdateMyTowTruckPayload } from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { ServiceType } from '~/types/enums'
import type { TowTruck } from '~/types/towTruck'
import { extractErrorMessage } from '~/utils/errors'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import { isPhone, validateField } from '~/utils/validators'
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

/** v-model wrapper that keeps a phone field locked to +374 + up to 8 digits */
function armenianPhoneModel(key: 'secondaryPhone' | 'whatsapp') {
  return computed<string>({
    get: () => form[key],
    set: (value) => {
      form[key] = armenianPhoneInputValue(value)
    },
  })
}

const secondaryPhoneModel = armenianPhoneModel('secondaryPhone')
const whatsappModel = armenianPhoneModel('whatsapp')

const errors = reactive({
  secondaryPhone: '',
  whatsapp: '',
})

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)

const existingImages = ref<{ id: number; url: string }[]>([])
const newImageFiles = shallowRef<File[]>([])
const newImagePreviews = ref<string[]>([])

/**
 * Ids of the newly picked files already uploaded, in `newImageFiles` order.
 *
 * Same reason as register.vue: uploads are one throttled request per photo
 * (10/60s per IP) and the save itself can still be rejected afterwards
 * (description too short, and so on). Without this, every retry re-uploads
 * every photo, so the second attempt can hit a 429 the driver can't act on —
 * and each abandoned attempt leaves orphans in Storage. Cleared whenever the
 * selection changes, since an id points at one specific uploaded file.
 */
const uploadedNewImageIds = ref<number[]>([])

function resetUploadedNewImages(): void {
  uploadedNewImageIds.value = []
}

/**
 * A published listing must always keep at least one photo — the backend
 * rejects an empty imageIds array (UpdateMyTowTruckDto), so blocking the last
 * removal here turns a confusing save-time rejection into an obvious disabled
 * button. Newly picked (not yet uploaded) files count toward the total, so a
 * driver can still swap their only photo: add the new one first, then drop
 * the old one.
 */
const totalImageCount = computed(() => existingImages.value.length + newImageFiles.value.length)
const canRemoveImage = computed(() => totalImageCount.value > 1)

function removeExistingImage(index: number): void {
  if (!canRemoveImage.value) return
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
  // Appending is safe for already-uploaded ids (they keep their indexes), but
  // resetting keeps the invariant trivially true rather than subtly true.
  resetUploadedNewImages()

  const previews = files.map((file) => URL.createObjectURL(file))
  newImagePreviews.value.push(...previews)

  if (input) input.value = ''
}

function removeNewImage(index: number): void {
  if (!canRemoveImage.value) return
  URL.revokeObjectURL(newImagePreviews.value[index])
  newImageFiles.value.splice(index, 1)
  newImagePreviews.value.splice(index, 1)
  resetUploadedNewImages()
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

  errors.secondaryPhone = validateField(form.secondaryPhone, [isPhone()]) ?? ''
  errors.whatsapp = validateField(form.whatsapp, [isPhone()]) ?? ''
  if (errors.secondaryPhone || errors.whatsapp) {
    saveError.value = 'Ստուգիր հեռախոսահամարների դաշտերը'
    return
  }

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

    // Resumes from where a previous attempt stopped — see uploadedNewImageIds
    for (const file of newImageFiles.value.slice(uploadedNewImageIds.value.length)) {
      const image = await imageRepository.upload(file)
      uploadedNewImageIds.value = [...uploadedNewImageIds.value, image.id]
    }
    payload.imageIds = [
      ...existingImages.value.map((i) => i.id),
      ...uploadedNewImageIds.value,
    ]

    truck.value = await myTowTruckRepository.updateMine(payload)
    fillFormFromTruck(truck.value)
    saveSuccess.value = true
    newImageFiles.value = []
    // Attached to the profile now — a later save must not resend these ids
    // as if they were still unattached uploads.
    resetUploadedNewImages()
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

      <!-- Analytics first: it's what a driver opens the dashboard to check -->
      <details class="dashboard-section">
        <summary class="dashboard-summary">Վիճակագրություն</summary>
        <div class="dashboard-details-content">
          <AnalyticsDashboard scope="driver" />
        </div>
      </details>

      <form class="dashboard-form" @submit.prevent="submit">
        <details class="dashboard-section">
          <summary class="dashboard-summary">Կոնտակտներ</summary>
          <div class="dashboard-details-content">
            <AppInput
              v-model="secondaryPhoneModel"
              type="tel"
              label="Լրացուցիչ հեռախոս"
              placeholder="+37499000001"
              :maxlength="12"
              :error="errors.secondaryPhone"
            />
            <AppInput
              v-model="whatsappModel"
              type="tel"
              label="WhatsApp"
              placeholder="+37491000001"
              :maxlength="12"
              :error="errors.whatsapp"
            />
            <AppInput v-model="form.telegram" label="Telegram username" />
            <AppInput v-model="form.email" type="email" label="Email" />
          </div>
        </details>

        <details class="dashboard-section">
          <summary class="dashboard-summary">Նկարագրություն</summary>
          <div class="dashboard-details-content">
            <AppInput v-model="form.description" label="Նկարագրություն" />
          </div>
        </details>

        <details class="dashboard-section">
          <summary class="dashboard-summary">Ծառայություններ</summary>
          <div class="dashboard-details-content">
            <ServiceCategoryPicker v-model="form.services" :categories="SERVICE_CATEGORIES" mode="form" />
            <div v-if="!is247" class="dashboard-working-hours">
              <p class="dashboard-working-hours__label">Աշխատանքային ժամեր (ոչ պարտադիր)</p>
              <div class="dashboard-working-hours__grid">
                <AppInput v-model="form.workingHoursStart" type="time" label="Սկիզբ" />
                <AppInput v-model="form.workingHoursEnd" type="time" label="Ավարտ" />
              </div>
            </div>
          </div>
        </details>

        <details class="dashboard-section">
          <summary class="dashboard-summary">Գներ (ոչ պարտադիր)</summary>
          <div class="dashboard-details-content">
            <AppInput v-model="form.priceCityCallout" type="number" label="Քաղաքի ներսում (֏)" />
            <AppInput v-model="form.pricePerKm" type="number" label="1 կմ-ի գին (֏)" />
            <AppInput v-model="form.priceWaitingPerHour" type="number" label="Սպասում, ժամում (֏)" />
            <AppInput
              v-model="form.priceNightSurchargePercent"
              type="number"
              label="Գիշերային հավելավճար (%)"
            />
            <AppInput v-model="form.priceExtraLoading" type="number" label="Լրացուցիչ բարձում (֏)" />
          </div>
        </details>

        <details class="dashboard-section">
          <summary class="dashboard-summary">Նկարներ</summary>
          <div class="dashboard-details-content">
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
                :disabled="!canRemoveImage"
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
                :disabled="!canRemoveImage"
                @click="removeNewImage(index)"
              >
                <AppIcon name="close" :size="14" />
              </button>
            </div>
          </div>
          
            <div v-if="existingImages.length + newImageFiles.length < 6" class="dashboard-file-input">
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
          </div>
        </details>


        <p v-if="saveError" class="dashboard-error">{{ saveError }}</p>
        <p v-if="saveSuccess" class="dashboard-success">Հաջողությամբ պահպանվեց ✓</p>

        <AppButton type="submit" variant="success" block :disabled="saving">
          {{ saving ? 'Պահպանվում է…' : 'Պահպանել' }}
        </AppButton>
      </form>

      <details class="dashboard-section dashboard-section--routes">
        <summary class="dashboard-summary">Ազատ երթուղիներ</summary>
        <div class="dashboard-details-content">
          <p class="dashboard-hint">
            Մեկնում եք ինչ-որ ուղղությամբ դատարկ։ Հրապարակեք երթուղին, և հաճախորդները, ովքեր շարժվում
            են նույն ուղղությամբ, կկարողանան կապվել ձեզ հետ։
          </p>
          <FreeRoutesManager :vehicle-type="truck.vehicle.type" />
        </div>
      </details>
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
  gap: var(--space-4);
  max-width: 640px;
  margin-top: var(--space-4);
}

.dashboard-section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition);

  &:hover {
    box-shadow: var(--shadow-md);
  }

  &[open] .dashboard-summary {
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-4);
  }
}

.dashboard-summary {
  font-weight: 600;
  font-size: 1.1rem;
  padding: var(--space-4);
  cursor: pointer;
  user-select: none;
  list-style: none; /* Hide default arrow */
  display: flex;
  align-items: center;
  justify-content: space-between;

  &::-webkit-details-marker {
    display: none;
  }

  &::after {
    content: '';
    display: inline-block;
    width: 24px;
    height: 24px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    transition: transform 0.3s ease;
  }
}

details[open] .dashboard-summary::after {
  transform: rotate(180deg);
}

.dashboard-details-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: 0 var(--space-4) var(--space-4);
}

.dashboard-section--routes {
  margin-top: var(--space-4);
  max-width: 640px;

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

  &:hover:not(:disabled) {
    background: #c0392b;
  }

  // Last remaining photo — a listing can never drop to zero images
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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
