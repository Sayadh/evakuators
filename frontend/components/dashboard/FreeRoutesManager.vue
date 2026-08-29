<script setup lang="ts">
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { myFreeRoutesRepository } from '~/repositories'
import type { VehicleType } from '~/types/enums'
import type { MyFreeRoute } from '~/types/freeRoute'
import { extractErrorMessage } from '~/utils/errors'
import { formatDepartureRange } from '~/utils/formatters'
import { buildEstimatedArrivalAt } from '~/utils/freeRouteArrival'
import { formatRouteLocation } from '~/utils/freeRouteLocation'
import { required, validateField } from '~/utils/validators'

interface Props {
  /** Auto-pulled from the driver's own profile — shown, never edited here */
  vehicleType: VehicleType
}

defineProps<Props>()

// Two independent pickers (start / end). Both read static geography, so no
// region list has to be fetched and passed in.
const start = useLocationPicker()
const end = useLocationPicker()

const departureDate = ref('')
const departureTime = ref('')
const arrivalTime = ref('')
const description = ref('')
const errors = reactive<Record<string, string>>({})

const editingId = ref<number | null>(null)
const isEditing = computed(() => editingId.value !== null)

const routes = ref<MyFreeRoute[]>([])
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')

const STATUS_LABELS: Record<MyFreeRoute['status'], string> = {
  ACTIVE: 'Ակտիվ',
  FINISHED: 'Ավարտված',
}

async function loadRoutes(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    routes.value = await myFreeRoutesRepository.getMine()
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Երթուղիները բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadRoutes()
})

function resetForm(): void {
  editingId.value = null
  start.reset()
  end.reset()
  departureDate.value = ''
  departureTime.value = ''
  arrivalTime.value = ''
  description.value = ''
  errors.startRegionSlug = ''
  errors.startCitySlug = ''
  errors.endRegionSlug = ''
  errors.endCitySlug = ''
  errors.departure = ''
  errors.arrival = ''
}

async function startEdit(route: MyFreeRoute): Promise<void> {
  editingId.value = route.id
  await Promise.all([
    start.setValue(route.startRegionSlug, route.startCitySlug),
    end.setValue(route.endRegionSlug, route.endCitySlug),
  ])
  const date = new Date(route.departureAt)
  departureDate.value = date.toISOString().slice(0, 10)
  departureTime.value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  // Only the clock time is reused — the date field stays departureDate, and
  // buildEstimatedArrivalAt() rolls it to the next day again on save if the
  // trip crosses midnight. A route from before this field existed has no
  // estimatedArrivalAt at all; left empty, validate() then asks the driver
  // to set one before the edit can save.
  if (route.estimatedArrivalAt) {
    const arrival = new Date(route.estimatedArrivalAt)
    arrivalTime.value = `${String(arrival.getHours()).padStart(2, '0')}:${String(arrival.getMinutes()).padStart(2, '0')}`
  } else {
    arrivalTime.value = ''
  }
  description.value = route.description ?? ''
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Combines the two native pickers into a single ISO datetime, local time */
function buildDepartureAt(): Date | null {
  if (!departureDate.value || !departureTime.value) return null
  const combined = new Date(`${departureDate.value}T${departureTime.value}:00`)
  return Number.isNaN(combined.getTime()) ? null : combined
}

function validate(): boolean {
  errors.startRegionSlug = validateField(start.regionSlug.value, [required('Ընտրեք մեկնարկի մարզը')]) ?? ''
  errors.startCitySlug = validateField(start.citySlug.value, [required('Ընտրեք մեկնարկի քաղաքը')]) ?? ''
  errors.endRegionSlug = validateField(end.regionSlug.value, [required('Ընտրեք վերջնակետի մարզը')]) ?? ''
  errors.endCitySlug = validateField(end.citySlug.value, [required('Ընտրեք վերջնակետի քաղաքը')]) ?? ''

  const departure = buildDepartureAt()
  if (!departure) {
    errors.departure = 'Ընտրեք մեկնման օրը և ժամը'
  } else if (departure.getTime() <= Date.now()) {
    errors.departure = 'Մեկնման ժամը պետք է լինի ապագայում'
  } else {
    errors.departure = ''
  }

  const arrival = departure ? buildEstimatedArrivalAt(departure, departureDate.value, arrivalTime.value) : null
  errors.arrival = arrival ? '' : 'Ընտրեք ժամանման մոտավոր ժամը'

  return Object.values(errors).every((error) => !error)
}

async function submit(): Promise<void> {
  if (!validate()) return

  const departure = buildDepartureAt()
  if (!departure) return
  const arrival = buildEstimatedArrivalAt(departure, departureDate.value, arrivalTime.value)
  if (!arrival) return

  saving.value = true
  saveError.value = ''
  try {
    const payload = {
      startRegionSlug: start.regionSlug.value,
      startCitySlug: start.citySlug.value,
      endRegionSlug: end.regionSlug.value,
      endCitySlug: end.citySlug.value,
      departureAt: departure.toISOString(),
      estimatedArrivalAt: arrival.toISOString(),
      description: description.value.trim() || undefined,
    }

    if (editingId.value !== null) {
      await myFreeRoutesRepository.update(editingId.value, payload)
    } else {
      await myFreeRoutesRepository.create(payload)
    }

    resetForm()
    await loadRoutes()
  } catch (error) {
    saveError.value = extractErrorMessage(
      error,
      'Չհաջողվեց պահպանել երթուղին։ Ստուգեք դաշտերը և փորձեք կրկին։',
    )
  } finally {
    saving.value = false
  }
}

const deletingId = ref<number | null>(null)

async function removeRoute(route: MyFreeRoute): Promise<void> {
  if (!import.meta.client || !window.confirm('Ջնջե՞լ այս երթուղին։')) return

  deletingId.value = route.id
  try {
    await myFreeRoutesRepository.remove(route.id)
    routes.value = routes.value.filter((item) => item.id !== route.id)
    if (editingId.value === route.id) resetForm()
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Ջնջել չհաջողվեց, փորձեք կրկին։')
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="free-routes-manager">
    <p class="free-routes-manager__vehicle">
      <AppIcon name="truck" :size="15" />
      Ձեր էվակուատորի տեսակը՝ {{ VEHICLE_TYPE_LABELS[vehicleType] }} (ավտոմատ, պրոֆիլից)
    </p>

    <form class="free-routes-manager__form" @submit.prevent="submit">
      <div class="free-routes-manager__grid">
        <AppSelect
          v-model="start.regionSlug.value"
          :options="start.regionOptions.value"
          label="Մեկնարկի մարզ"
          hint="Այստեղից եք մեկնում դատարկ, դեռ առանց հաճախորդի"
          :error="errors.startRegionSlug"
        />
        <AppSelect
          v-model="start.citySlug.value"
          :options="start.cityOptions.value"
          label="Մեկնարկի քաղաք"
          :disabled="start.cityOptions.value.length === 0"
          :error="errors.startCitySlug"
        />
        <AppSelect
          v-model="end.regionSlug.value"
          :options="end.regionOptions.value"
          label="Վերջնակետի մարզ"
          hint="Իսկ այստեղ եք ուղևորվում՝ ուր և կարող եք վերցնել հաճախորդ ճանապարհին"
          :error="errors.endRegionSlug"
        />
        <AppSelect
          v-model="end.citySlug.value"
          :options="end.cityOptions.value"
          label="Վերջնակետի քաղաք"
          :disabled="end.cityOptions.value.length === 0"
          :error="errors.endCitySlug"
        />
        <AppInput v-model="departureDate" type="date" label="Մեկնման օր" required />
        <AppInput v-model="departureTime" type="time" label="Մեկնման ժամ" required />
        <AppInput
          v-model="arrivalTime"
          type="time"
          label="Ժամանման մոտավոր ժամ"
          hint="Այս ժամից հետո երթուղին ինքնաշխատ հեռացվում է կայքից"
          required
        />
      </div>

      <p class="free-routes-manager__note">
        <AppIcon name="info" :size="14" />
        Երթուղին կայքում մնում է գտնելի մեկնումից մինչև նշված ժամանման ժամը՝ դրանից հետո ինքնաշխատ հեռացվում է
        համակարգից։ Ընտրեք ժամանման ժամը այնպես, որ ընդգրկի ամբողջ ճանապարհի տևողությունը, որպեսզի հայտարարությունը
        մնա գտնելի ողջ ուղու ընթացքում։ Եթե ժամանման ժամը մեկնման ժամից շուտ է, այն համարվում է հաջորդ օրվա (գիշերային
        երթուղի)։
      </p>

      <p v-if="errors.departure" class="free-routes-manager__error" role="alert">
        {{ errors.departure }}
      </p>
      <p v-if="errors.arrival" class="free-routes-manager__error" role="alert">
        {{ errors.arrival }}
      </p>

      <AppInput
        v-model="description"
        label="Մեկնաբանություն (ոչ պարտադիր)"
        placeholder="Օր.՝ կարող եմ սպասել կես ժամ ճանապարհին"
      />

      <p v-if="saveError" class="free-routes-manager__error" role="alert">{{ saveError }}</p>

      <div class="free-routes-manager__actions">
        <AppButton type="submit" variant="accent" :disabled="saving">
          {{ saving ? 'Պահպանվում է…' : isEditing ? 'Պահպանել փոփոխությունները' : 'Հրապարակել երթուղին' }}
        </AppButton>
        <AppButton v-if="isEditing" type="button" variant="ghost" @click="resetForm">
          Չեղարկել
        </AppButton>
      </div>
    </form>

    <LoadingSkeleton v-if="loading" variant="text" :count="3" />
    <p v-else-if="loadError" class="free-routes-manager__error">{{ loadError }}</p>
    <p v-else-if="routes.length === 0" class="free-routes-manager__empty">
      Դեռ չունեք հրապարակված երթուղիներ։
    </p>

    <ul v-else class="free-routes-manager__list">
      <li v-for="route in routes" :key="route.id" class="free-routes-manager__item">
        <div class="free-routes-manager__item-info">
          <p class="free-routes-manager__item-route">
            {{ formatRouteLocation(route.startRegionSlug, route.startCitySlug) }}
            <AppIcon name="arrow-right" :size="14" />
            {{ formatRouteLocation(route.endRegionSlug, route.endCitySlug) }}
          </p>
          <p class="free-routes-manager__item-meta">
            {{ formatDepartureRange(route.departureAt, route.estimatedArrivalAt) }} ·
            <span :class="`free-routes-manager__status free-routes-manager__status--${route.status.toLowerCase()}`">
              {{ STATUS_LABELS[route.status] }}
            </span>
          </p>
        </div>
        <div class="free-routes-manager__item-actions">
          <AppButton variant="outline" size="sm" @click="startEdit(route)">Խմբագրել</AppButton>
          <AppButton
            variant="danger"
            size="sm"
            :disabled="deletingId === route.id"
            @click="removeRoute(route)"
          >
            Ջնջել
          </AppButton>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.free-routes-manager {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);

  &__vehicle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-size: 0.88rem;
    color: var(--color-text-secondary);

    svg {
      color: var(--color-text-muted);
    }
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
    }
  }

  &__actions {
    display: flex;
    gap: var(--space-2);
  }

  &__note {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);

    svg {
      flex-shrink: 0;
      margin-top: 2px;
      color: var(--color-text-muted);
    }
  }

  &__error {
    color: var(--color-danger);
    font-size: 0.9rem;
    margin: 0;
  }

  &__empty {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  &__list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  &__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
  }

  &__item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__item-route {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-weight: 600;

    svg {
      color: var(--color-accent);
    }
  }

  &__item-meta {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  &__status {
    font-weight: 600;

    &--active {
      color: var(--color-success);
    }

    &--finished {
      color: var(--color-text-muted);
    }
  }

  &__item-actions {
    display: flex;
    gap: var(--space-2);
  }
}
</style>
