<script setup lang="ts">
import { SERVICE_CATEGORIES } from '~/constants/services'
import { validateServiceAreaSelection } from '~/constants/serviceAreaLimits'
import { SITE_NAME } from '~/constants/site'
import {
  CAPACITY_RANGE_OPTIONS,
  matchesCapacityRange,
  representativeCapacityTons,
  VEHICLE_TYPE_DESCRIPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '~/constants/vehicles'
import { imageRepository, myTowTruckRepository, type UpdateMyTowTruckPayload } from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
import { LocationType, ServiceType } from '~/types/enums'
import type { VehicleType } from '~/types/enums'
import type { SelectOption } from '~/types/common'
import type { TowTruck } from '~/types/towTruck'
import { formatCoordinates, type Coordinates } from '~/utils/coordinates'
import { extractErrorMessage } from '~/utils/errors'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import {
  cityOrDistrictLabel,
  findCityLocation,
  findServiceZoneLocation,
  resolveAreaType,
  YEREVAN_REGION_SLUG,
} from '~/utils/geography'
import { toOptionalFloat } from '~/utils/registrationPayload'
import { isDimension, isPhone, isYear, required, validateField } from '~/utils/validators'
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

/**
 * Mirrors the registration form field-for-field, minus the two things a driver
 * can't change about themselves (`slug`, main `phone` — shown read-only below).
 * That symmetry is the point: anything asked at sign-up must be fixable here,
 * or the only way to correct a typo is to register all over again.
 */
const form = reactive({
  driverName: '',
  companyName: '',
  secondaryPhone: '',
  whatsapp: '',
  telegram: '',
  email: '',

  vehicleBrand: '',
  vehicleModel: '',
  vehicleYear: '',
  vehicleType: '' as VehicleType | '',
  /** A band slug, exactly as at registration — converted to an exact float on submit */
  capacity: '',
  platformLengthM: '',
  platformWidthM: '',
  winch: false,
  manipulator: false,
  wheelSkates: false,

  description: '',
  services: [] as ServiceType[],
  workingHoursStart: '',
  workingHoursEnd: '',

  locationName: '',
  regionSlugs: [] as string[],
  citySlugs: [] as string[],

  priceCityCallout: '',
  pricePerKm: '',
  priceWaitingPerHour: '',
  priceNightSurchargePercent: '',
  priceExtraLoading: '',
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

const errors = reactive<Record<string, string>>({
  driverName: '',
  secondaryPhone: '',
  whatsapp: '',
  vehicleBrand: '',
  vehicleYear: '',
  vehicleType: '',
  capacity: '',
  platformDimensions: '',
  locationName: '',
  regionSlugs: '',
  citySlugs: '',
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

/**
 * Turns the profile back into the band slug the driver originally picked.
 *
 * The DB stores an exact float, but the form has to offer the same five bands
 * registration does — showing a raw `5` where the driver chose «3.5–5 տոննա»
 * would be a different question than the one they answered. `matchesCapacityRange`
 * is the same predicate the public filter uses, so a truck always lands back in
 * the band a customer would find it under. See docs/taxonomies.md.
 */
function capacityRangeFromTons(capacityTons: number): string {
  return (
    CAPACITY_RANGE_OPTIONS.find((option) => matchesCapacityRange(capacityTons, option.value))
      ?.value ?? ''
  )
}

function fillFormFromTruck(data: TowTruck): void {
  form.driverName = data.driverName
  form.companyName = data.companyName ?? ''
  form.secondaryPhone = data.secondaryPhone ?? ''
  form.whatsapp = data.whatsapp ?? ''
  form.telegram = data.telegram ?? ''
  form.email = data.email ?? ''

  form.vehicleBrand = data.vehicle.brand
  form.vehicleModel = data.vehicle.model
  form.vehicleYear = data.vehicle.year.toString()
  form.vehicleType = data.vehicle.type
  form.capacity = capacityRangeFromTons(data.vehicle.capacityTons)
  form.platformLengthM = data.vehicle.platformLengthM?.toString() ?? ''
  form.platformWidthM = data.vehicle.platformWidthM?.toString() ?? ''
  form.winch = data.vehicle.winch
  form.manipulator = data.vehicle.manipulator
  form.wheelSkates = data.vehicle.wheelSkates

  form.description = data.description
  form.services = [...data.services]
  const { start, end } = splitWorkingHoursRange(data.workingHoursText)
  form.workingHoursStart = start
  form.workingHoursEnd = end

  form.locationName = data.location.name
  form.citySlugs = data.serviceAreas.map((area) => area.slug)
  // Regions aren't stored — they're implied by the areas. Yerevan districts map
  // to the pseudo-region, real cities to their own marz, and road corridors to
  // theirs (static lookups, no request). Deduped because two cities of one marz
  // must not tick it twice.
  //
  // The corridor branch is not optional. `findCityLocation` returns null for a
  // zone slug, and the `.filter(Boolean)` below then drops it silently — so a
  // driver whose coverage was a corridor used to load with that marz missing:
  // its group never rendered, the corridor was invisible and unremovable, and a
  // driver covering ONLY a corridor got zero regions and could not save at all
  // ("Ընտրեք 1-2 մարզ" against a form they had no way to satisfy). Now that
  // `regionSlugs` also decides the coverage budget and is sent to the backend,
  // the same gap would have handed them the wrong limit as well.
  form.regionSlugs = [
    ...new Set(
      data.serviceAreas
        .map((area) => {
          if (area.type === LocationType.District) return YEREVAN_REGION_SLUG
          if (area.type === LocationType.Route) {
            return findServiceZoneLocation(area.slug)?.regionSlug
          }
          return findCityLocation(area.slug)?.regionSlug
        })
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ]

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

/**
 * Structural placement slug: the first selected area that is an actual place.
 *
 * `citySlug`/`districtSlug` is what the browsing pages filter on, so it has to
 * be a city or a district. Road corridors are neither — a truck cannot be
 * "based in" «Գառնի–Գեղարդ», and writing a corridor slug into `citySlug` would
 * put the driver in a city listing that does not exist. A driver whose ONLY
 * coverage is corridors has no structural placement at all, which the backend
 * already allows (both columns are nullable) and which the region rollup in
 * `servesRegion` covers.
 */
function findPlaceSlug(slugs: string[]): string | undefined {
  return slugs.find((slug) => resolveAreaType(slug) !== LocationType.Route)
}

function validate(): boolean {
  errors.driverName = validateField(form.driverName, [required('Լրացրեք Անուն Ազգանունը')]) ?? ''
  errors.secondaryPhone = validateField(form.secondaryPhone, [isPhone()]) ?? ''
  errors.whatsapp = validateField(form.whatsapp, [isPhone()]) ?? ''
  errors.vehicleBrand = validateField(form.vehicleBrand, [required('Լրացրեք մեքենայի մակնիշը')]) ?? ''
  errors.vehicleYear = validateField(form.vehicleYear, [required(), isYear()]) ?? ''
  errors.vehicleType = validateField(form.vehicleType, [required('Ընտրեք մեքենայի տեսակը')]) ?? ''
  errors.capacity =
    validateField(form.capacity, [required('Ընտրեք առավելագույն բեռնատարողությունը')]) ?? ''
  // Optional, but both-or-neither — same rule as the working-hours pair
  errors.platformDimensions =
    validateField(form.platformLengthM, [isDimension()]) ??
    validateField(form.platformWidthM, [isDimension()]) ??
    (Boolean(form.platformLengthM.trim()) !== Boolean(form.platformWidthM.trim())
      ? 'Լրացրեք և՛ երկարությունը, և՛ լայնությունը, կամ թողեք երկուսն էլ դատարկ'
      : '')
  errors.locationName = validateField(form.locationName, [required('Լրացրեք հիմնական վայրը')]) ?? ''
  errors.regionSlugs = form.regionSlugs.length === 0 ? 'Ընտրեք 1-2 մարզ' : ''
  // Same rule and same message as registration — a driver must be able to fix
  // afterwards exactly what they were allowed to choose at sign-up. This is
  // also the check a driver approved before the cap existed meets on their next
  // save: their stored coverage is left alone, but changing anything means
  // bringing it within the limit first.
  errors.citySlugs = validateServiceAreaSelection(form.regionSlugs, form.citySlugs)

  return Object.values(errors).every((error) => !error)
}

async function submit(): Promise<void> {
  saveError.value = ''
  saveSuccess.value = false

  if (!validate()) {
    saveError.value = 'Ստուգիր նշված դաշտերը'
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

    // Resolved here, not on the backend, which has no geography at all — the
    // same contract the admin approval flow follows (see ServiceAreaDto).
    const serviceAreas = form.citySlugs.map((slug) => ({
      slug,
      name: cityOrDistrictLabel(slug),
      type: resolveAreaType(slug),
    }))

    // Structural placement, derived exactly as approve() derives it: a Yerevan
    // district truck has a districtSlug and no region, a real city has both —
    // and a corridor is skipped entirely (see findPlaceSlug).
    const primarySlug = findPlaceSlug(form.citySlugs)
    const primaryType = primarySlug ? resolveAreaType(primarySlug) : undefined

    const payload: UpdateMyTowTruckPayload = {
      driverName: form.driverName.trim(),
      // All five are sent even when empty — '' is how the backend is told to
      // clear the field, while omitting the key means "leave it alone".
      // Sending `undefined` for a box the driver just emptied is how a value
      // became impossible to remove: they cleared WhatsApp, saved, and the old
      // number was still on their card because the request never mentioned it.
      companyName: form.companyName.trim(),
      secondaryPhone: form.secondaryPhone.trim(),
      whatsapp: form.whatsapp.trim(),
      telegram: form.telegram.trim(),
      email: form.email.trim(),

      vehicleBrand: form.vehicleBrand.trim(),
      vehicleModel: form.vehicleModel.trim() || undefined,
      vehicleYear: Number(form.vehicleYear),
      vehicleType: form.vehicleType || undefined,
      capacityTons: representativeCapacityTons(form.capacity),
      platformLengthM: toOptionalFloat(form.platformLengthM),
      platformWidthM: toOptionalFloat(form.platformWidthM),
      winch: form.winch,
      manipulator: form.manipulator,
      wheelSkates: form.wheelSkates,

      description: form.description.trim(),
      services: form.services,
      workingHoursText:
        is247.value || !hasFullHours
          ? undefined
          : formatWorkingHoursRange(form.workingHoursStart, form.workingHoursEnd),

      locationName: form.locationName.trim(),
      serviceAreas,
      // Not stored — it tells the backend's cap whether this is one marz or
      // two, which `serviceAreas` cannot say on its own.
      regionSlugs: form.regionSlugs,
      ...(primaryType === LocationType.District
        ? { districtSlug: primarySlug }
        : primaryType === LocationType.City
          ? { citySlug: primarySlug, regionSlug: findCityLocation(primarySlug as string)?.regionSlug }
          : {}),

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

/* ── Base parking coordinates ────────────────────────────────────────────────
 *
 * Deliberately OUTSIDE the big profile form, with its own dialog and its own
 * request (`PATCH /my/tow-truck/coordinates`).
 *
 * Two reasons. The value is a single indivisible pair that a driver sets once
 * and then rarely touches, so burying it among thirty other fields would mean
 * scrolling past it forever; and every driver approved before this feature
 * existed has none, which makes "you have not set this yet" a state the page
 * has to show and act on, not a blank input among other blank inputs.
 *
 * It also keeps the main Save honest: a driver fixing a typo in their price
 * list should not have their coordinates re-submitted as a side effect, and a
 * coordinate that fails validation should not block a save that has nothing to
 * do with it.
 */
const coordinatesDialogOpen = ref(false)
const savingCoordinates = ref(false)
const coordinatesError = ref('')
const coordinatesSuccess = ref(false)

/** The stored pair in canonical form — also what pre-fills the dialog */
const currentCoordinates = computed(() =>
  formatCoordinates(truck.value?.location.latitude, truck.value?.location.longitude),
)

const hasCoordinates = computed(() => currentCoordinates.value !== '')

function openCoordinatesDialog(): void {
  coordinatesError.value = ''
  coordinatesSuccess.value = false
  coordinatesDialogOpen.value = true
}

/**
 * The dialog has already parsed and range-checked what was typed, so this only
 * has to deal with the request. On failure the dialog stays open holding the
 * driver's text and showing the backend's own message — closing it would throw
 * away what they typed for a problem they might fix in one keystroke.
 */
async function saveCoordinates(coordinates: Coordinates): Promise<void> {
  savingCoordinates.value = true
  coordinatesError.value = ''
  try {
    // The response is the full refreshed profile, so the displayed pair comes
    // from what Postgres stored rather than from what was sent.
    //
    // Deliberately NOT followed by fillFormFromTruck() the way the main save
    // is: that would overwrite the big edit form with the server's copy, and a
    // driver who was halfway through rewriting their description when they
    // stopped to fix their coordinates would silently lose it. Nothing in that
    // form depends on the coordinates, so there is nothing to re-sync.
    truck.value = await myTowTruckRepository.updateCoordinates(
      coordinates.latitude,
      coordinates.longitude,
    )
    coordinatesDialogOpen.value = false
    coordinatesSuccess.value = true
  } catch (error) {
    coordinatesError.value = extractErrorMessage(
      error,
      'Կոորդինատները պահպանել չհաջողվեց։ Ստուգեք կապը և փորձեք կրկին։',
    )
  } finally {
    savingCoordinates.value = false
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

    <!-- Before the loading state, and before anything else on the page: a
         driver still holding the password we generated has one thing to do
         here, and the rest of the dashboard is not it. Rendered INSTEAD of the
         page rather than over it, so there is nothing behind to tab into and
         no dialog to dismiss — the block is structural, not a z-index. -->
    <section v-if="driverAuth.mustChangePassword" class="dashboard-password-gate">
      <h2>Սահմանեք Ձեր գաղտնաբառը</h2>
      <ChangePasswordForm forced />
    </section>

    <LoadingSkeleton v-else-if="loading" variant="text" :count="5" />

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
          <summary class="dashboard-summary">Ընդհանուր տվյալներ</summary>
          <div class="dashboard-details-content">
            <AppInput
              v-model="form.driverName"
              label="Անուն Ազգանուն"
              required
              :error="errors.driverName"
            />
            <AppInput
              v-model="form.companyName"
              label="Կազմակերպության անուն (ոչ պարտադիր)"
              placeholder="Թողեք դատարկ, եթե չունեք"
            />

            <!-- Read-only, but shown: everything from registration has to be
                 visible here, and silently omitting these two would just make
                 a driver hunt for them. See UpdateMyTowTruckDto for why they
                 stay admin-only. -->
            <div class="dashboard-readonly">
              <div>
                <dt>Հիմնական հեռախոսահամար</dt>
                <dd>{{ truck.phone }}</dd>
              </div>
              <div>
                <dt>Պրոֆիլի հասցե</dt>
                <dd>/tow-trucks/{{ truck.slug }}</dd>
              </div>
              <p class="dashboard-readonly__note">
                Այս երկուսը փոխվում են միայն admin-ի միջոցով — հիմնական համարով եք մուտք
                գործում, իսկ հասցեն փոխելը կկոտրի արդեն տարածված հղումները։ Դիմեք մեզ։
              </p>
            </div>
          </div>
        </details>

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
          <summary class="dashboard-summary">Մեքենա</summary>
          <div class="dashboard-details-content">
            <AppInput
              v-model="form.vehicleBrand"
              label="Մակնիշ"
              required
              :error="errors.vehicleBrand"
            />
            <AppInput v-model="form.vehicleModel" label="Մոդել (ոչ պարտադիր)" />
            <AppInput
              v-model="form.vehicleYear"
              type="number"
              label="Արտադրության տարեթիվ"
              required
              :error="errors.vehicleYear"
            />
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
                    class="dashboard-type-hint"
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
              :error="errors.capacity"
            />
            <PlatformDimensionsInput
              v-model:length="form.platformLengthM"
              v-model:width="form.platformWidthM"
              :error="errors.platformDimensions"
            />

            <div class="dashboard-checks">
              <AppCheckbox v-model="form.winch" label="Ունի ճախարակ (winch, лебедка)" />
              <AppCheckbox v-model="form.manipulator" label="Ունի մանիպուլյատոր" />
              <AppCheckbox v-model="form.wheelSkates" label="Առկա են անիվային ռոլիկներ">
                <template #label-suffix>
                  <AppTooltip label="Անիվային ռոլիկների բացատրություն">
                    Անիվային ռոլիկներն օգտագործվում են արգելափակված կամ չպտտվող անիվներով
                    մեքենան անվտանգ հարթակ բարձրացնելու և տեղափոխելու համար։
                  </AppTooltip>
                </template>
              </AppCheckbox>
            </div>
          </div>
        </details>

        <details class="dashboard-section">
          <summary class="dashboard-summary">Տարածքներ</summary>
          <div class="dashboard-details-content">
            <AppInput
              v-model="form.locationName"
              label="Որտե՞ղ եք սովորաբար կանգնում"
              placeholder="Օր.՝ Նոր Նորք"
              required
              :error="errors.locationName"
            />
            <!-- The very same component the registration form uses — what a
                 driver could pick at sign-up is exactly what they can change
                 here, by construction rather than by remembering to. -->
            <ServiceAreaPicker
              v-model:regions="form.regionSlugs"
              v-model:cities="form.citySlugs"
              :regions-error="errors.regionSlugs"
              :cities-error="errors.citySlugs"
            />
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

      <!-- Outside the profile <form> on purpose — this pair saves itself
           through its own endpoint, so it must not ride along with (or be
           blocked by) the main Save. Same placement reasoning as
           FreeRoutesManager below. -->
      <details class="dashboard-section dashboard-section--location" open>
        <summary class="dashboard-summary">Տեղադիրք</summary>
        <div class="dashboard-details-content">
          <p class="dashboard-hint">
            Կոորդինատներն անհրաժեշտ են, որպեսզի հաճախորդին ցույց տանք իրեն ամենամոտ գտնվող
            էվակուատորները։
          </p>

          <div class="dashboard-location">
            <dl class="dashboard-location__value">
              <dt>Կոորդինատներ</dt>
              <dd v-if="hasCoordinates">{{ currentCoordinates }}</dd>
              <dd v-else class="dashboard-location__empty">Տեղադիրքը նշված չէ</dd>
            </dl>

            <AppButton variant="outline" size="sm" @click="openCoordinatesDialog">
              {{ hasCoordinates ? 'Փոխել կոորդինատները' : 'Ավելացնել կոորդինատներ' }}
            </AppButton>
          </div>

          <!-- Only the success line lives out here. The failure message stays
               inside the dialog, next to the field that caused it and the text
               the driver would have to correct. -->
          <p v-if="coordinatesSuccess" class="dashboard-success">
            Կոորդինատները հաջողությամբ պահպանվեցին ✓
          </p>
        </div>
      </details>

      <CoordinatesDialog
        v-model="coordinatesDialogOpen"
        title="Էվակուատորի տեղադիրքի կոորդինատներ"
        :initial-value="currentCoordinates"
        :saving="savingCoordinates"
        :error="coordinatesError"
        @save="saveCoordinates"
      />

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

      <!-- Collapsed and last: changing a password is rare, and this is the one
           section a driver comes to the dashboard for by name rather than by
           scrolling. Same component as the forced gate above — see
           ChangePasswordForm for why it is not two implementations. -->
      <details class="dashboard-section dashboard-section--password">
        <summary class="dashboard-summary">Գաղտնաբառ</summary>
        <div class="dashboard-details-content">
          <ChangePasswordForm />
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

.dashboard-checks {
  display: flex;
  flex-direction: column;
}

/* Tooltip body listing every vehicle type — same content as the register form */
.dashboard-type-hint {
  display: block;

  & + & {
    margin-top: var(--space-2);
  }

  strong {
    display: block;
  }
}

/* Fields a driver can see but not edit (main phone, profile URL) */
.dashboard-readonly {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);

  dt {
    font-size: 0.78rem;
    color: var(--color-text-secondary);
    margin-bottom: 2px;
  }

  dd {
    margin: 0;
    font-weight: 600;
    word-break: break-all;
  }

  &__note {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--color-text-secondary);
  }
}

.dashboard-section--routes {
  margin-top: var(--space-4);
  max-width: 640px;

  .dashboard-hint {
    margin-bottom: 0;
  }
}

/* Same column as the form, the routes block and the location block, so the
   stack reads as one width rather than four. */
.dashboard-section--password {
  margin-top: var(--space-4);
  max-width: 640px;
}

/* The forced first password change. Narrower than the dashboard it replaces —
   at this point the page holds one form and nothing else, and the full 960px
   column would leave three short fields adrift in it. */
.dashboard-password-gate {
  max-width: 480px;
  margin-top: var(--space-5);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);

  h2 {
    margin: 0 0 var(--space-4);
    font-size: 1.2rem;
  }
}

/* Base parking coordinates — same column width as the form and the routes
   block, so the three read as one stack rather than three widths. */
.dashboard-section--location {
  margin-top: var(--space-4);
  max-width: 640px;

  .dashboard-hint {
    margin-bottom: 0;
  }
}

.dashboard-location {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);

  /* The value and its button sit side by side once there is room; on a phone
     the button drops below and goes full width rather than being squeezed
     next to a coordinate pair that already fills the line. */
  flex-direction: column;
  align-items: stretch;

  @media (min-width: 480px) {
    flex-direction: row;
    align-items: center;
  }

  &__value {
    margin: 0;
    min-width: 0;

    dt {
      font-size: 0.78rem;
      color: var(--color-text-secondary);
      margin-bottom: 2px;
    }

    dd {
      margin: 0;
      font-weight: 600;
      word-break: break-word;

      /* Muted and lighter, not red: having no coordinates yet is the normal
         state for every driver approved before this existed, not a mistake
         they made. */
      &.dashboard-location__empty {
        color: var(--color-text-muted);
        font-weight: 500;
      }
    }
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
