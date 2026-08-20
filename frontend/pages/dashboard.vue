<script setup lang="ts">
import { serviceCategoriesFor, withService } from '~/constants/services'
import {
  COVERAGE_MODE_OPTIONS,
  hasUncappedCoverage,
  uncappedCoverageReason,
  validateServiceAreaSelection,
  type CoverageMode,
} from '~/constants/serviceAreaLimits'
import { SITE_NAME } from '~/constants/site'
import {
  asksWheelSkates,
  CAPACITY_RANGE_OPTIONS,
  capacityRangeFromTons,
  representativeCapacityTons,
  specialistSpecFieldsFor,
  usesExactCapacity,
  VEHICLE_TYPE_DESCRIPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '~/constants/vehicles'
import {
  imageRepository,
  myTowTruckRepository,
  privacyConsentRepository,
  type DriverProfileChangeStatus,
  type UpdateMyTowTruckPayload,
} from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
// VehicleType is a value import, not `import type` — see the manipulator rule
// below, which compares against the enum member itself.
import { LocationType, ServiceType, VehicleType } from '~/types/enums'
import type { SelectOption } from '~/types/common'
import type { TowTruck } from '~/types/towTruck'
import { formatCoordinates, type Coordinates } from '~/utils/coordinates'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateNumeric } from '~/utils/formatters'
import { formatProfileValue, profileFieldLabel } from '~/utils/profileChangeLabels'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import {
  findCityLocation,
  findServiceZoneLocation,
  resolveAreaType,
  YEREVAN_REGION_SLUG,
} from '~/utils/geography'
import {
  numberFieldText,
  syncVehicleDependentFields,
  validateSpecialistSpecs,
} from '~/utils/registrationForm'
import { baseCandidatesFor, buildServiceAreas } from '~/utils/serviceAreas'
import { toOptionalFloat } from '~/utils/registrationPayload'
import { isDimension, isPhone, isYear, required, validateField } from '~/utils/validators'
import { formatWorkingHoursRange, splitWorkingHoursRange } from '~/utils/workingHours'

// Signed-out visitors never reach this page. In middleware, not in a top-level
// `await navigateTo(...)` here — see middleware/driver-auth.ts for why that
// version could silently fail to navigate.
definePageMeta({ middleware: 'driver-auth' })

useSeoMetaData({
  title: `Իմ պրոֆիլը | ${SITE_NAME}`,
  description: 'Խմբագրեք ձեր էվակուատորի պրոֆիլը։',
  path: '/dashboard',
  noindex: true,
})

const driverAuth = useDriverAuthStore()

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

  vehicleBrand: '',
  vehicleModel: '',
  vehicleYear: '',
  vehicleType: '' as VehicleType | '',
  /** A band slug, exactly as at registration — converted to an exact float on submit */
  capacity: '',
  platformLengthM: '',
  platformWidthM: '',
  /** The specialist technical answers — see SPECIALIST_SPEC_FIELDS */
  craneCapacityTons: '',
  craneReachM: '',
  maxLoadTons: '',
  platformLoadHeightCm: '',
  winch: false,
  manipulator: false,
  wheelSkates: false,
  /**
   * «Ծանր տեխնիկայի տեղափոխում», proposed here and approved by a moderator —
   * a dashboard save queues a diff, it does not write (see
   * `docs/api-reference.md` § "Driver edits are moderated"), which is what
   * keeps this a request rather than a self-granted listing.
   */
  heavyEquipment: false,
  servesAllArmenia: false,

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

/**
 * Same rule as registration, and shared with it by intent rather than by code:
 * picking «Մանիպուլյատորով էվակուատոր» already answers «Ունի մանիպուլյատոր», so
 * the checkbox is ticked and locked instead of asked twice.
 *
 * CLAUDE.md's "registration and the dashboard must offer the same fields" cuts
 * both ways — a field that behaves differently on the two forms is the same
 * problem as a field missing from one of them. The backend derives it too
 * (`MyTowTruckService.updateMine`), which is the actual boundary; this is the
 * part the driver can see.
 *
 * One direction only: changing the type away does not untick it, because a
 * flatbed carrying a crane is a real vehicle and that `true` may be the
 * driver's own answer.
 */
const isManipulatorType = computed(() => form.vehicleType === VehicleType.Manipulator)
const isHeavyDutyType = computed(() => form.vehicleType === VehicleType.HeavyDuty)

/**
 * Which questions this vehicle gets — the same three resolvers the registration
 * form uses, imported rather than re-derived. That is the parity rule made
 * mechanical: a service added to `MANIPULATOR_SERVICES` or a field added to
 * `SPECIALIST_SPEC_FIELDS` appears on both forms without either page changing.
 */
const serviceCategories = computed(() => serviceCategoriesFor(form.vehicleType))
const specFields = computed(() => specialistSpecFieldsFor(form.vehicleType))
const showCapacityBand = computed(() => !usesExactCapacity(form.vehicleType))
const showWheelSkates = computed(() => asksWheelSkates(form.vehicleType))

/** «Հաշիվ-ապրանքագիր» as a plain boolean over one slug in `services` */
const providesInvoice = computed<boolean>({
  get: () => form.services.includes(ServiceType.InvoiceProvided),
  set: (value) => {
    form.services = withService(form.services, ServiceType.InvoiceProvided, value)
  },
})

const uncapped = computed(() => hasUncappedCoverage(form))
const uncappedReason = computed(() => uncappedCoverageReason(form))

const coverageMode = computed<CoverageMode>({
  get: () => (form.servesAllArmenia ? 'all-armenia' : 'regions'),
  set: (value) => {
    form.servesAllArmenia = value === 'all-armenia'
  },
})

const coverageModeOptions: SelectOption[] = COVERAGE_MODE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}))

// One watcher, one shared rule set — see `syncVehicleDependentFields` for what
// each consequence is for, and why all three inputs are watched rather than
// just the type.
watch(
  () => [form.vehicleType, form.manipulator, form.heavyEquipment],
  () => syncVehicleDependentFields(form),
)

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
  // Set by the shared `validateSpecialistSpecs`, which clears every one of
  // them first — a field that stopped being shown must stop reporting.
  craneCapacityTons: '',
  craneReachM: '',
  maxLoadTons: '',
  platformLoadHeightCm: '',
  locationName: '',
  regionSlugs: '',
  citySlugs: '',
  /** Only an uncapped driver picks a base explicitly — see `basePlaceSlug` */
  baseSlug: '',
})

const saving = ref(false)
const saveError = ref('')
/**
 * A save no longer publishes anything — it queues an edit for review, and this
 * is what says so.
 *
 * Three outcomes, and they are genuinely different things to tell a driver:
 * `'queued'` (a moderator will look at it), `'unchanged'` (nothing differed, so
 * nothing was queued — the form submits every field whether or not it was
 * touched, so this is easy to reach by accident), and `false` (nothing has been
 * submitted yet this session).
 */
const saveOutcome = ref<'queued' | 'unchanged' | false>(false)

/* ── The moderation queue ─────────────────────────────────────────────────
 *
 * Every field on this page is moderated. A driver's save used to go straight
 * into the public listing; it now creates a `ProfileChangeRequest` holding only
 * what differs, and the live profile is untouched until an admin approves.
 *
 * This page therefore has to answer three questions it never had before: is
 * something waiting, what exactly is in it, and — if the last attempt was
 * refused — why.
 */
const profileChange = ref<DriverProfileChangeStatus | null>(null)
const withdrawing = ref(false)

const pendingFields = computed(() => profileChange.value?.pending?.fields ?? [])
const lastRejection = computed(() =>
  profileChange.value?.lastReviewed?.status === 'REJECTED'
    ? profileChange.value.lastReviewed
    : null,
)

async function loadProfileChange(): Promise<void> {
  try {
    profileChange.value = await myTowTruckRepository.getProfileChange()
  } catch {
    // Never surfaced. The banner is extra context on a page whose real job is
    // the form, and a failed status read must not look like a failed save.
  }
}

/**
 * Withdraws the queued edit.
 *
 * The live profile was never touched, so there is nothing to roll back — this
 * only frees the one pending slot. Offered because the alternative for a driver
 * who queued something by mistake is to wait for a rejection.
 */
async function withdrawProfileChange(): Promise<void> {
  if (!confirm('Հետ վերցնե՞լ ուղարկված փոփոխությունները։')) return

  withdrawing.value = true
  try {
    await myTowTruckRepository.withdrawProfileChange()
    saveOutcome.value = false
    await loadProfileChange()
  } catch (error) {
    saveError.value = extractErrorMessage(error, 'Հետ վերցնել չհաջողվեց։')
  } finally {
    withdrawing.value = false
  }
}

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

  // Reassigning `.value` rather than mutating in place — `newImageFiles` is a
  // `shallowRef` (deliberately: File objects should not go through Vue's
  // reactive() proxy), so an in-place `.push()` never notifies. `canRemoveImage`
  // read `newImageFiles.value.length` and stayed stuck at its last computed
  // value, leaving the remove buttons disabled even after more photos were
  // added right after hitting the 1-photo floor.
  newImageFiles.value = [...newImageFiles.value, ...files]
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
  // Same reassignment reason as onNewImagesChange above — .splice() on a
  // shallowRef's array would not notify canRemoveImage's dependents either.
  newImageFiles.value = newImageFiles.value.filter((_, i) => i !== index)
  newImagePreviews.value.splice(index, 1)
  resetUploadedNewImages()
}

onBeforeUnmount(() => {
  newImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
})

function fillFormFromTruck(data: TowTruck): void {
  form.driverName = data.driverName
  form.companyName = data.companyName ?? ''
  form.secondaryPhone = data.secondaryPhone ?? ''
  form.whatsapp = data.whatsapp ?? ''
  form.telegram = data.telegram ?? ''

  form.vehicleBrand = data.vehicle.brand
  form.vehicleModel = data.vehicle.model
  form.vehicleYear = data.vehicle.year.toString()
  form.vehicleType = data.vehicle.type
  // The band, for the drivers who are asked for a band. A specialist is asked
  // for `maxLoadTons` above instead, and `syncVehicleDependentFields` clears
  // this the moment the type says so — see `usesExactCapacity`.
  form.capacity = capacityRangeFromTons(data.vehicle.capacityTons)
  // See `numberFieldText`: a stored 0 rendered as "0", which `isDimension`
  // then rejected — so a driver in that state could never save their profile.
  form.platformLengthM = numberFieldText(data.vehicle.platformLengthM)
  form.platformWidthM = numberFieldText(data.vehicle.platformWidthM)
  form.craneCapacityTons = numberFieldText(data.vehicle.craneCapacityTons)
  form.craneReachM = numberFieldText(data.vehicle.craneReachM)
  form.maxLoadTons = numberFieldText(data.vehicle.maxLoadTons)
  form.platformLoadHeightCm = numberFieldText(data.vehicle.platformLoadHeightCm)
  form.winch = data.vehicle.winch
  form.manipulator = data.vehicle.manipulator
  form.wheelSkates = data.vehicle.wheelSkates
  // Owner-only field — the public profile withholds it, `/my/tow-truck` sends
  // it back so the driver can see the state of their own request.
  form.heavyEquipment = data.vehicle.heavyEquipment ?? false
  form.servesAllArmenia = data.servesAllArmenia

  form.description = data.description
  form.services = [...data.services]
  const { start, end } = splitWorkingHoursRange(data.workingHoursText)
  form.workingHoursStart = start
  form.workingHoursEnd = end

  form.locationName = data.location.name
  // The stored placement, so an uncapped driver sees their own base selected
  // rather than an empty select they have to re-answer. Ignored for a capped
  // driver, whose base is inferred from their coverage list as it always was.
  chosenBaseSlug.value = data.location.citySlug ?? data.location.districtSlug ?? ''
  // A `region` entry is coverage, not a city — an uncapped driver's marz list
  // lives in `regionSlugs` below, and putting its slugs in `citySlugs` would
  // put a marz slug through `cityOrDistrictLabel` and render the raw slug.
  form.citySlugs = data.serviceAreas
    .filter((area) => area.type !== LocationType.Region)
    .map((area) => area.slug)
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
          // A marz-wide area IS the region — an uncapped driver's whole answer.
          // Without this branch `findCityLocation('syunik')` returns null, the
          // filter below drops it, and the driver loads with no regions ticked
          // and no way to see or change coverage they definitely have.
          if (area.type === LocationType.Region) return area.slug
          if (area.type === LocationType.District) return YEREVAN_REGION_SLUG
          if (area.type === LocationType.Route) {
            return findServiceZoneLocation(area.slug)?.regionSlug
          }
          return findCityLocation(area.slug)?.regionSlug
        })
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ]

  form.priceCityCallout = numberFieldText(data.pricing?.cityCallout)
  form.pricePerKm = numberFieldText(data.pricing?.perKm)
  form.priceWaitingPerHour = numberFieldText(data.pricing?.waitingPerHour)
  form.priceNightSurchargePercent = numberFieldText(data.pricing?.nightSurchargePercent)
  form.priceExtraLoading = numberFieldText(data.pricing?.extraLoading)
  existingImages.value = data.imageDetails ? [...data.imageDetails] : []

  // The picked-but-not-yet-published photos, cleared here and only here.
  //
  // A queued save keeps them, so that saving twice does not drop the photo out
  // of the pending edit (see onSubmit). This runs when the profile is loaded
  // fresh, which is the one moment the server's copy is authoritative: whatever
  // was approved is now in `existingImages`, and whatever was not is a choice
  // the driver can make again.
  newImageFiles.value = []
  resetUploadedNewImages()
  newImagePreviews.value.forEach((url) => URL.revokeObjectURL(url))
  newImagePreviews.value = []
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

/**
 * The privacy-consent block, for drivers who were published before consent was
 * ever asked for.
 *
 * ## Why the API is asked, when the session already carries a flag
 *
 * `driverAuth.requiresPrivacyConsent` is cached in `localStorage` at login and
 * a driver's session lasts 30 days, so it goes stale in both directions: a
 * policy bumped to 1.2 leaves a cached `false` that would let a driver past a
 * block they now owe, and a consent given in another tab leaves a cached `true`
 * that would keep showing the dialog to somebody who already answered it. This
 * read is the authority; the cached flag exists only so the first paint is
 * right.
 *
 * ## Why it starts from the cached flag rather than from `false`
 *
 * Initialising to `false` would render the whole dashboard for the moment
 * between mount and the response — a driver who owes a consent would see, and
 * could start typing into, the profile they are not yet allowed to manage. The
 * cached value is usually correct, so starting there means the common case
 * never flashes and the rare stale case corrects itself a moment later.
 */
const requiresConsent = ref(false)
const consentSubmitting = ref(false)
const consentError = ref('')

async function loadConsentStatus(): Promise<void> {
  try {
    const status = await privacyConsentRepository.getStatus()
    requiresConsent.value = status.requiresPrivacyConsent
    driverAuth.syncPrivacyConsent(status.requiresPrivacyConsent)
  } catch {
    // Deliberately silent, and deliberately NOT falling back to "blocked".
    //
    // A network blip must not lock a driver out of their own dashboard behind a
    // dialog whose confirm button would also fail. The cached flag from login
    // is left standing, which is the best answer available: it was correct at
    // login and is wrong only across a version bump. A driver who slips through
    // one failed read is asked again on their next load, and the backend still
    // holds the record either way.
  }
}

async function onConsentConfirmed(): Promise<void> {
  if (consentSubmitting.value) return

  consentSubmitting.value = true
  consentError.value = ''
  try {
    const status = await privacyConsentRepository.accept()
    requiresConsent.value = status.requiresPrivacyConsent
    driverAuth.syncPrivacyConsent(status.requiresPrivacyConsent)
  } catch (error) {
    consentError.value = extractErrorMessage(
      error,
      'Համաձայնությունը պահպանել չհաջողվեց։ Ստուգեք կապը և փորձեք կրկին։',
    )
  } finally {
    consentSubmitting.value = false
  }
}

/**
 * «Չեղարկել» on the mandatory dialog ends the session.
 *
 * Nothing is recorded — there is no "declined" row, because a refusal is not a
 * consent and storing it would be keeping data about someone who just told us
 * not to. What happens instead is the honest consequence: without consent we
 * cannot let them manage a published profile, so the session ends and they land
 * on the login page, exactly as `logout()` does everywhere else on this page.
 *
 * `replace`, for the same reason `logout()` uses it: Back must not return to a
 * dashboard they no longer have a session for.
 */
async function onConsentCancelled(): Promise<void> {
  driverAuth.logout()
  await navigateTo('/login', { replace: true })
}

onMounted(() => {
  if (!driverAuth.isLoggedIn) return
  requiresConsent.value = driverAuth.requiresPrivacyConsent
  void load()
  void loadProfileChange()
  void loadConsentStatus()
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

/**
 * The places this driver may be based in — their coverage list, or (uncapped)
 * the settlements of the marzes they cover. Shared with the admin review page.
 */
const baseCandidates = computed(() => baseCandidatesFor(form))

/**
 * The base the profile is filed under.
 *
 * A capped driver's base is inferred from their own coverage list, exactly as
 * before — the first non-corridor entry. An uncapped one has no such list, so
 * they name it explicitly (`chosenBaseSlug`), and it must stay one of the
 * candidates: `assertPlacementIsServed` rejects anything else, and a base the
 * driver no longer covers is a truck ranking first on a town's page while being
 * the one driver who never agreed to go there.
 */
const chosenBaseSlug = ref('')

const basePlaceSlug = computed(() =>
  uncapped.value ? chosenBaseSlug.value || undefined : findPlaceSlug(form.citySlugs),
)

const baseOptions = computed<SelectOption[]>(() =>
  baseCandidates.value.map((candidate) => ({ value: candidate.slug, label: candidate.name })),
)

// Clears a base that has fallen out of the candidate list — otherwise the
// select renders blank while still holding a value, and the save is rejected
// with a message about an area the driver can no longer see on screen.
watch(baseCandidates, (candidates) => {
  if (chosenBaseSlug.value && !candidates.some((c) => c.slug === chosenBaseSlug.value)) {
    chosenBaseSlug.value = ''
  }
})

function validate(): boolean {
  errors.driverName = validateField(form.driverName, [required('Լրացրեք Անուն Ազգանունը')]) ?? ''
  errors.secondaryPhone = validateField(form.secondaryPhone, [isPhone()]) ?? ''
  errors.whatsapp = validateField(form.whatsapp, [isPhone()]) ?? ''
  errors.vehicleBrand = validateField(form.vehicleBrand, [required('Լրացրեք մեքենայի մակնիշը')]) ?? ''
  errors.vehicleYear = validateField(form.vehicleYear, [required(), isYear()]) ?? ''
  errors.vehicleType = validateField(form.vehicleType, [required('Ընտրեք մեքենայի տեսակը')]) ?? ''
  // The band OR the exact figure, never both — the same single rule
  // registration applies (see `usesExactCapacity`), imported rather than
  // restated so the two forms cannot start disagreeing about which is required.
  errors.capacity = usesExactCapacity(form.vehicleType)
    ? ''
    : validateField(form.capacity, [required('Ընտրեք առավելագույն բեռնատարողությունը')]) ?? ''
  validateSpecialistSpecs(form, errors)
  // Optional, but both-or-neither — same rule as the working-hours pair
  errors.platformDimensions =
    validateField(form.platformLengthM, [isDimension()]) ??
    validateField(form.platformWidthM, [isDimension()]) ??
    (Boolean(form.platformLengthM.trim()) !== Boolean(form.platformWidthM.trim())
      ? 'Լրացրեք և՛ երկարությունը, և՛ լայնությունը, կամ թողեք երկուսն էլ դատարկ'
      : '')
  errors.locationName = validateField(form.locationName, [required('Լրացրեք հիմնական վայրը')]) ?? ''
  // The «1-2 մարզ» wording is wrong for an uncapped driver, who may pick as
  // many as they work in, and for one who answered «Ամբողջ Հայաստան», who has
  // answered already — so the region rule moves inside the shared validator,
  // which can see who is being asked.
  errors.regionSlugs =
    uncapped.value || form.regionSlugs.length > 0 ? '' : 'Ընտրեք 1-2 մարզ'
  // Same rule and same message as registration — a driver must be able to fix
  // afterwards exactly what they were allowed to choose at sign-up. This is
  // also the check a driver approved before the cap existed meets on their next
  // save: their stored coverage is left alone, but changing anything means
  // bringing it within the limit first.
  errors.citySlugs = validateServiceAreaSelection(form.regionSlugs, form.citySlugs, form)
  // The base is required for everyone (`TowTruck.locationName` always was), but
  // only an uncapped driver picks it explicitly — for everyone else it is
  // derived from the coverage list, so an error here would name a control that
  // is not on their screen.
  errors.baseSlug =
    uncapped.value && !chosenBaseSlug.value ? 'Ընտրեք մեքենայի հիմնական վայրը' : ''

  return Object.values(errors).every((error) => !error)
}

async function submit(): Promise<void> {
  saveError.value = ''
  saveOutcome.value = false

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

    // Structural placement, derived exactly as approve() derives it: a Yerevan
    // district truck has a districtSlug and no region, a real city has both —
    // and a corridor is skipped entirely (see findPlaceSlug).
    //
    // For an uncapped driver the candidates come from the marzes they cover
    // rather than from a city list they were never asked for; `basePlaceSlug`
    // keeps whichever of the two applies.
    const primarySlug = basePlaceSlug.value

    // Resolved here, not on the backend, which has no geography at all — the
    // same contract the admin approval flow follows (see ServiceAreaDto), and
    // the same builder the review page uses so a marz-wide coverage answer
    // cannot be stored two different ways.
    const serviceAreas = buildServiceAreas({ ...form, baseSlug: primarySlug })
    const primaryType = primarySlug ? resolveAreaType(primarySlug) : undefined

    const payload: UpdateMyTowTruckPayload = {
      driverName: form.driverName.trim(),
      // All four are sent even when empty — '' is how the backend is told to
      // clear the field, while omitting the key means "leave it alone".
      // Sending `undefined` for a box the driver just emptied is how a value
      // became impossible to remove: they cleared WhatsApp, saved, and the old
      // number was still on their card because the request never mentioned it.
      companyName: form.companyName.trim(),
      secondaryPhone: form.secondaryPhone.trim(),
      whatsapp: form.whatsapp.trim(),
      telegram: form.telegram.trim(),

      vehicleBrand: form.vehicleBrand.trim(),
      vehicleModel: form.vehicleModel.trim() || undefined,
      vehicleYear: Number(form.vehicleYear),
      vehicleType: form.vehicleType || undefined,
      // The exact figure wins when there is one — the same preference
      // `AdminService.approve` applies, so a self-edited specialist truck and
      // an approved one land on identical values and keep matching the same
      // capacity filter. See `usesExactCapacity`.
      capacityTons:
        toOptionalFloat(form.maxLoadTons) ?? representativeCapacityTons(form.capacity),
      platformLengthM: toOptionalFloat(form.platformLengthM),
      platformWidthM: toOptionalFloat(form.platformWidthM),
      craneCapacityTons: toOptionalFloat(form.craneCapacityTons),
      craneReachM: toOptionalFloat(form.craneReachM),
      maxLoadTons: toOptionalFloat(form.maxLoadTons),
      platformLoadHeightCm: toOptionalFloat(form.platformLoadHeightCm),
      winch: form.winch,
      manipulator: form.manipulator,
      wheelSkates: form.wheelSkates,
      // Queued for moderation like everything else on this form — a save does
      // not write (see `docs/api-reference.md` § "Driver edits are moderated").
      heavyEquipment: form.heavyEquipment,
      servesAllArmenia: form.servesAllArmenia,

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
    // Deduplicated, because a newly uploaded id can legitimately appear on both
    // sides: once an edit is approved the photo joins `existingImages`, while
    // `uploadedNewImageIds` still remembers uploading it (see below for why
    // that memory is kept). Sending it twice would put the same photo in the
    // gallery twice and make the diff look like a change on a save that
    // changed nothing.
    payload.imageIds = [
      ...new Set([...existingImages.value.map((i) => i.id), ...uploadedNewImageIds.value]),
    ]

    // The response is the queue status, not a profile: nothing was published,
    // so `truck` is deliberately NOT reassigned and the form is not refilled.
    // Refilling it from a profile that has not changed would silently discard
    // the driver's own edits the instant they submitted them.
    const status = await myTowTruckRepository.updateMine(payload)
    saveOutcome.value = status.pending ? 'queued' : 'unchanged'
    if (status.pending) {
      profileChange.value = status
    } else {
      // Nothing was queued, so this response says nothing about the queue — its
      // `lastReviewed` is null because the endpoint that answers a submission
      // has no reason to look one up. Assigning it would wipe a rejection
      // banner the driver still needs to read, on a save that changed nothing.
      await loadProfileChange()
    }

    // The picked files and their ids are deliberately NOT cleared here.
    //
    // They used to be, with a comment saying they were "attached to the profile
    // now" — which was true while a save was a write and is false now that it
    // queues. Nothing is attached until a moderator approves, so a driver who
    // added a photo, saved, then fixed a typo and saved again would have sent a
    // second payload without those ids: the queued edit would be replaced by
    // one that had lost the photo, the upload would become an orphan, and
    // nothing on screen would have said so.
    //
    // Keeping them means the next save resubmits the same edit, which is what
    // the driver expects, and `uploadedNewImageIds` still prevents re-uploading
    // the same file. `load()` clears the lot once the page is opened again.
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
    // Queued, not saved — the base location is as public a claim as a service
    // area, so it goes through the same review. `truck` is therefore NOT
    // reassigned: the marker on this page still shows the pair that is live,
    // which is the honest thing to show while a new one waits.
    const status = await myTowTruckRepository.updateCoordinates(
      coordinates.latitude,
      coordinates.longitude,
    )
    profileChange.value = status
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
  // `replace`, so Back does not return to a dashboard the driver has just
  // signed out of — `driver-auth` would bounce them to /login anyway, but only
  // after a flash of a page they no longer have a session for.
  await navigateTo('/login', { replace: true })
}
</script>

<template>
  <div class="container dashboard-page">
    <header class="dashboard-header">
      <h1>Իմ պրոֆիլը</h1>
      <AppButton variant="outline" size="sm" @click="logout">Դուրս գալ</AppButton>
    </header>

    <!-- The consent gate comes FIRST, above the password gate, and the order is
         deliberate: permission to publish this person's data is a precondition
         for us holding it at all, whereas the password is about how they reach
         it. A driver who has not consented should not be asked to invest in an
         account first.

         Rendered INSTEAD of the page — same structural block the password gate
         uses, for the same reason stated below it — with the dialog on top. The
         placeholder behind it is deliberately empty of anything actionable, so
         the dialog is not merely covering a dashboard that is still there. -->
    <section v-if="requiresConsent" class="dashboard-consent-gate">
      <h2>Անհրաժեշտ է Ձեր համաձայնությունը</h2>
      <p>
        Ձեր էջը կառավարելը շարունակելու համար խնդրում ենք ծանոթանալ և հաստատել տվյալների
        օգտագործման և հրապարակման համաձայնությունը։
      </p>
    </section>

    <!-- Before the loading state, and before anything else on the page: a
         driver still holding the password we generated has one thing to do
         here, and the rest of the dashboard is not it. Rendered INSTEAD of the
         page rather than over it, so there is nothing behind to tab into and
         no dialog to dismiss — the block is structural, not a z-index. -->
    <section v-else-if="driverAuth.mustChangePassword" class="dashboard-password-gate">
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

      <!-- The state of the queue, above the form rather than beside the save
           button. A driver who has something waiting needs to know it before
           they start editing again — the second save replaces the first, and
           finding that out afterwards is finding it out too late. -->
      <section v-if="profileChange?.pending" class="dashboard-review dashboard-review--pending">
        <h2 class="dashboard-review__title">Փոփոխությունները սպասում են հաստատման</h2>
        <p class="dashboard-review__text">
          Ուղարկվել է {{ formatDateNumeric(profileChange.pending.createdAt) }}։ Կայքում դեռ
          երևում է նախորդ տարբերակը — ադմինիստրատորը կստուգի և կհաստատի։
        </p>
        <ul class="dashboard-review__fields">
          <li v-for="entry in pendingFields" :key="entry.field">
            <span class="dashboard-review__field-name">{{ profileFieldLabel(entry.field) }}</span>
            <span class="dashboard-review__before">
              {{ formatProfileValue(entry.field, entry.before) }}
            </span>
            →
            <span class="dashboard-review__after">
              {{ formatProfileValue(entry.field, entry.after) }}
            </span>
          </li>
        </ul>
        <AppButton variant="outline" size="sm" :disabled="withdrawing" @click="withdrawProfileChange">
          {{ withdrawing ? 'Հետ է վերցվում…' : 'Հետ վերցնել' }}
        </AppButton>
      </section>

      <!-- Shown only when nothing is waiting: a driver who has resubmitted is
           looking at the new attempt, and the previous refusal beside it would
           read as a verdict on that. -->
      <section v-else-if="lastRejection" class="dashboard-review dashboard-review--rejected">
        <h2 class="dashboard-review__title">Վերջին փոփոխությունները չեն հաստատվել</h2>
        <p class="dashboard-review__text">{{ lastRejection.rejectionReason }}</p>
        <p class="dashboard-review__text dashboard-review__text--muted">
          Ուղղեք և կրկին ուղարկեք։
        </p>
      </section>

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
            <!-- The band, or the exact tonnage below — never both. Same rule,
                 same resolver as registration (`usesExactCapacity`). -->
            <AppSelect
              v-if="showCapacityBand"
              v-model="form.capacity"
              :options="CAPACITY_RANGE_OPTIONS"
              label="Առավելագույն բեռնատարողություն"
              :error="errors.capacity"
            />
            <AppInput
              v-for="field in specFields"
              :key="field.key"
              v-model="form[field.key]"
              :label="`${field.label} (${field.unit})${field.required ? ' *' : ''}`"
              type="number"
              :placeholder="field.placeholder"
              :error="errors[field.key]"
            />
            <PlatformDimensionsInput
              v-model:length="form.platformLengthM"
              v-model:width="form.platformWidthM"
              :error="errors.platformDimensions"
            />

            <div class="dashboard-checks">
              <AppCheckbox v-model="form.winch" label="Ունի ճախարակ (winch, лебедка)" />
              <!-- Locked rather than hidden, same as registration: the driver
                   should see that the answer is yes, not wonder where the
                   question went. -->
              <AppCheckbox
                v-model="form.manipulator"
                label="Ունի մանիպուլյատոր"
                :disabled="isManipulatorType"
              />
              <!-- Same field, same lock rule, same wording as registration —
                   see RegistrationFormFields.vue. A tick here is a request: the
                   save is queued as a diff and a moderator approves it, which
                   is what keeps /tsanr-tehnika something a driver can ask for
                   and not something they can grant themselves. -->
              <AppCheckbox
                v-model="form.heavyEquipment"
                label="Ծանր տեխնիկայի տեղափոխում"
                :disabled="isHeavyDutyType"
              >
                <template #label-suffix>
                  <AppTooltip label="Ծանր տեխնիկայի տեղափոխման բացատրություն">
                    Նշեք սա, եթե ձեր մեքենան կարող է տեղափոխել էքսկավատոր, բուլդոզեր,
                    բեռնիչ կամ այլ ծանր տեխնիկա։ Փոփոխությունը հաստատվելուց հետո
                    կհայտնվեք նաև ծանր տեխնիկայի որոնման արդյունքներում։
                  </AppTooltip>
                </template>
              </AppCheckbox>
              <!-- Hidden for a manipulator and a transporter, same rule as
                   registration — see `asksWheelSkates`. -->
              <AppCheckbox
                v-if="showWheelSkates"
                v-model="form.wheelSkates"
                label="Առկա են անիվային ռոլիկներ"
              >
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
            <!-- Two coverage questions, the same split registration makes and
                 for the same reason — see RegistrationFormFields.vue. -->
            <template v-if="uncapped">
              <p class="dashboard-note">{{ uncappedReason }}</p>
              <!-- Chips rather than a dropdown, same call as registration —
                   the choice decides whether a marz picker exists below it. -->
              <AppChoiceChips
                v-model="coverageMode"
                :options="coverageModeOptions"
                label="Սպասարկման տարածք"
                name="dashboard-coverage-mode"
              />
              <ServiceRegionPicker
                v-if="!form.servesAllArmenia"
                v-model="form.regionSlugs"
                :error="errors.regionSlugs || errors.citySlugs"
              />
              <!-- Explicit here, unlike for a capped driver whose base is the
                   first entry of their own city list. The base is required
                   whatever the coverage answer is: it decides which marz and
                   city page the truck is filed under, and the nearest-driver
                   search reads it. -->
              <AppSelect
                v-model="chosenBaseSlug"
                :options="baseOptions"
                label="Մեքենայի հիմնական վայրը *"
                :error="errors.baseSlug"
              />
            </template>
            <!-- The very same component the registration form uses — what a
                 driver could pick at sign-up is exactly what they can change
                 here, by construction rather than by remembering to. -->
            <ServiceAreaPicker
              v-else
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
            <ServiceCategoryPicker v-model="form.services" :categories="serviceCategories" mode="form" />
            <!-- Its own checkbox, same as registration — an invoice is a
                 document, not a way of paying. See `STANDALONE_SERVICES`. -->
            <div class="dashboard-standalone">
              <AppCheckbox v-model="providesInvoice" label="Տրամադրում եմ հաշիվ-ապրանքագիր">
                <template #label-suffix>
                  <AppTooltip label="Հաշիվ-ապրանքագրի բացատրություն">
                    Կազմակերպությունների պատվերների համար հաճախ պարտադիր է։ Նշեք սա, եթե
                    կարող եք տրամադրել հաշիվ-ապրանքագիր։
                  </AppTooltip>
                </template>
              </AppCheckbox>
            </div>
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
        <!-- Never «պահպանվեց»: nothing was. Saying so would be the one message
             on this page that is actively false, and the driver would go and
             look at their public profile for a change that is not there yet. -->
        <p v-if="saveOutcome === 'queued'" class="dashboard-success">
          Ուղարկվեց հաստատման ✓ — կայքում կերևա ադմինիստրատորի հաստատումից հետո։
        </p>
        <p v-else-if="saveOutcome === 'unchanged'" class="dashboard-hint">
          Փոփոխություն չկար։
        </p>

        <AppButton type="submit" variant="success" block :disabled="saving">
          {{ saving ? 'Ուղարկվում է…' : 'Ուղարկել հաստատման' }}
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
          <!-- Never «պահպանվեցին»: nothing was. The pair is moderated like
               every other public claim, so the marker above still shows the
               live one until an admin approves — and a driver told their
               location was saved would go looking for it on their profile. -->
          <p v-if="coordinatesSuccess" class="dashboard-success">
            Ուղարկվեց հաստատման ✓ — քարտեզի վրա կթարմացվի ադմինիստրատորի
            հաստատումից հետո։
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

    <!-- Outside the `v-if` chain above, so it renders over whichever branch is
         showing. `mandatory`, unlike the registration page's copy: cancelling
         here signs the driver out, so a stray backdrop click must not be able
         to trigger it. -->
    <PrivacyConsentDialog
      v-model="requiresConsent"
      mandatory
      :submitting="consentSubmitting"
      :error="consentError"
      @confirm="onConsentConfirmed"
      @cancel="onConsentCancelled"
    />
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

/* What sits behind the mandatory consent dialog.
 *
 * Same card as the password gate, but deliberately containing nothing to do:
 * the action is in the dialog on top of it. It exists so the page is not blank
 * behind a modal (which reads as a broken load) and so a driver who somehow
 * dismisses the dialog still sees why they are stuck rather than an empty
 * dashboard. */
.dashboard-consent-gate {
  max-width: 480px;
  margin-top: var(--space-5);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);

  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.2rem;
  }

  p {
    margin: 0;
    color: var(--color-text-secondary);
    line-height: 1.6;
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

.dashboard-standalone {
  margin-top: var(--space-4);
}

.dashboard-note {
  margin: 0 0 var(--space-3);
  font-size: 0.9rem;
  color: var(--color-text-muted);
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

/* The moderation banner. Two variants of one block rather than two blocks: they
   occupy the same slot, say the same kind of thing about the same queue, and
   are mutually exclusive by construction (see getStatusForDriver). */
.dashboard-review {
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;

  &--pending {
    background: rgba(240, 173, 78, 0.12);
    border: 1px solid rgba(240, 173, 78, 0.4);
  }

  &--rejected {
    background: rgba(217, 83, 79, 0.1);
    border: 1px solid rgba(217, 83, 79, 0.35);
  }

  &__title {
    margin: 0;
    font-size: 1.05rem;
  }

  &__text {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.6;

    &--muted {
      color: var(--color-text-muted);
    }
  }

  &__fields {
    margin: 0;
    padding-left: var(--space-4);
    font-size: 0.88rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__field-name {
    font-weight: 600;

    &::after {
      content: ':';
      margin-right: 4px;
    }
  }

  &__before {
    color: var(--color-text-muted);
    text-decoration: line-through;
  }

  &__after {
    font-weight: 600;
  }
}
</style>
