<script setup lang="ts">
import { FetchError } from 'ofetch'
import { SERVICE_LABELS } from '~/constants/services'
import { SITE_NAME } from '~/constants/site'
import { representativeCapacityTons, VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import {
  adminAuthRepository,
  adminRepository,
  isApiEnabled,
  type AdminRegistrationRequest,
  type AdminReview,
  type AdminTowTruck,
  type ApproveRegistrationPayload,
} from '~/repositories'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { LocationType } from '~/types/enums'
import type { ServiceType, VehicleType } from '~/types/enums'
import { extractErrorMessage } from '~/utils/errors'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import {
  cityOrDistrictLabel,
  findCityLocation,
  findStaticRegion,
  resolveAreaType,
  YEREVAN_REGION_SLUG,
} from '~/utils/geography'
import { isPhone, required, validateField } from '~/utils/validators'

/**
 * Internal moderation panel — not linked from the public site and excluded
 * from the sitemap. Protected by a real backend JWT (POST /admin-auth/login,
 * see backend/src/admin-auth) issued to the User accounts with role ADMIN.
 * Create one on the server with `npm run admin:create -- <email> <password>`.
 */
useSeoMetaData({
  title: `Ադմին վահանակ | ${SITE_NAME}`,
  description: 'Ներքին մոդերացիայի էջ',
  path: '/admin',
  noindex: true,
})

const apiEnabled = isApiEnabled()
const adminAuth = useAdminAuthStore()

/**
 * Two-step login: password first, then (if this admin has linked Telegram —
 * see backend `npm run admin:telegram-link`) a 6-digit code sent there.
 * `requiresCode: false` means Telegram isn't linked yet, so login()
 * already returns a usable token — see backend AdminAuthService.
 */
type LoginStep = 'credentials' | 'code'
const loginStep = ref<LoginStep>('credentials')
const loginEmail = ref('')
const loginPassword = ref('')
const loginCode = ref('')
const loginSubmitting = ref(false)
const loginError = ref('')

/**
 * Step 1's proof, held in component state only — deliberately NOT in
 * localStorage the way the session token is. It is valid for 5 minutes and is
 * single-use, so it has no reason to survive a page reload, and not storing it
 * removes one place a credential can leak from. Reloading mid-login simply
 * sends the admin back to the password step, which is the correct outcome.
 */
const pendingToken = ref('')

function isUnauthorized(error: unknown): boolean {
  return error instanceof FetchError && error.statusCode === 401
}

async function afterLogin(token: string): Promise<void> {
  adminAuth.login(token)
  await Promise.all([loadRegistrations(), loadReviews(), loadTowTrucks()])
}

async function submitCredentials(): Promise<void> {
  loginError.value = ''
  loginSubmitting.value = true
  try {
    const result = await adminAuthRepository.login(loginEmail.value.trim(), loginPassword.value)
    if (result.requiresCode) {
      pendingToken.value = result.pendingToken
      loginStep.value = 'code'
    } else {
      await afterLogin(result.token)
    }
  } catch (error) {
    loginError.value = isUnauthorized(error)
      ? 'Սխալ email կամ գաղտնաբառ։'
      : extractErrorMessage(error, 'Կապի սխալ, փորձիր կրկին։')
  } finally {
    loginSubmitting.value = false
  }
}

async function submitCode(): Promise<void> {
  loginError.value = ''
  loginSubmitting.value = true
  try {
    const session = await adminAuthRepository.verifyCode(pendingToken.value, loginCode.value.trim())
    // Single-use on the backend too (its challenge is consumed), but there is
    // no reason to keep a spent credential in memory either.
    pendingToken.value = ''
    await afterLogin(session.token)
  } catch (error) {
    loginError.value = isUnauthorized(error)
      ? 'Սխալ կոդ։'
      : extractErrorMessage(error, 'Կապի սխալ, փորձիր կրկին։')
  } finally {
    loginSubmitting.value = false
  }
}

function backToCredentials(): void {
  loginStep.value = 'credentials'
  loginCode.value = ''
  loginError.value = ''
  // Going back means starting over: the next password submit issues a fresh
  // challenge and a fresh token, so this one is dead either way.
  pendingToken.value = ''
}

function logout(): void {
  adminAuth.logout()
  loginStep.value = 'credentials'
  loginEmail.value = ''
  loginPassword.value = ''
  loginCode.value = ''
  pendingToken.value = ''
  registrations.value = []
  reviews.value = []
  towTrucks.value = []
}

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

const statusOptions = [
  { value: 'PENDING', label: 'Սպասող' },
  { value: 'APPROVED', label: 'Հաստատված' },
  { value: 'REJECTED', label: 'Մերժված' },
  { value: 'ALL', label: 'Բոլորը' },
]

/**
 * Admin listings are paginated server-side (see backend AdminListQuery): these
 * tables only ever grow, and the panel was refetching every row ever created on
 * each visit. One page at a time, "load more" for the rest.
 */
const ADMIN_PAGE_SIZE = 50

const statusFilter = ref<StatusFilter>('PENDING')
const registrations = ref<AdminRegistrationRequest[]>([])
const reviews = ref<AdminReview[]>([])
const towTrucks = ref<AdminTowTruck[]>([])
const loadingRegistrations = ref(false)
const loadingReviews = ref(false)
const loadingTowTrucks = ref(false)
const registrationsError = ref('')
const reviewsError = ref('')
const towTrucksError = ref('')
/** Id of the row whose action button is currently in flight (disables just that button) */
const actioningId = ref<number | null>(null)
/** A full page came back, so there is probably another one — drives "load more" */
const hasMoreRegistrations = ref(false)
const hasMoreReviews = ref(false)
const hasMoreTowTrucks = ref(false)

/**
 * Full-size image viewer shared by both the registration-request cards and
 * the tow-truck cards — an admin approving a request needs to actually see
 * what was uploaded, not just a 84×84 thumbnail. One global overlay rather
 * than one per card since only one can ever be open at a time.
 */
const lightboxImages = ref<string[]>([])
const lightboxIndex = ref(0)
const lightboxOpen = ref(false)

const lightboxImage = computed(() => lightboxImages.value[lightboxIndex.value] ?? '')
const lightboxHasMultiple = computed(() => lightboxImages.value.length > 1)

function openLightbox(images: string[], index: number): void {
  lightboxImages.value = images
  lightboxIndex.value = index
  lightboxOpen.value = true
}

function closeLightbox(): void {
  lightboxOpen.value = false
}

function lightboxNext(): void {
  lightboxIndex.value = (lightboxIndex.value + 1) % lightboxImages.value.length
}

function lightboxPrev(): void {
  lightboxIndex.value = (lightboxIndex.value - 1 + lightboxImages.value.length) % lightboxImages.value.length
}

function onLightboxKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeLightbox()
  else if (event.key === 'ArrowRight' && lightboxHasMultiple.value) lightboxNext()
  else if (event.key === 'ArrowLeft' && lightboxHasMultiple.value) lightboxPrev()
}

// A Teleport'd overlay never holds document focus, so a `@keydown` bound on
// the div itself would never fire — listen on `document` instead (see the
// same pattern in AppDrawer.vue) and only while the lightbox is actually open.
watch(lightboxOpen, (open) => {
  if (!import.meta.client) return
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) document.addEventListener('keydown', onLightboxKeydown)
  else document.removeEventListener('keydown', onLightboxKeydown)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onLightboxKeydown)
})

function serviceLabel(slug: string): string {
  return SERVICE_LABELS[slug as ServiceType] ?? slug
}

function vehicleTypeLabel(slug: string): string {
  return VEHICLE_TYPE_LABELS[slug as VehicleType] ?? slug
}

/** Yerevan isn't in staticRegions (it's a pseudo-region — see CLAUDE.md), so it needs its own case */
function regionLabel(slug: string): string {
  if (slug === YEREVAN_REGION_SLUG) return 'Երևան'
  return findStaticRegion(slug)?.name ?? slug
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('hy-AM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusBadgeVariant(status: AdminRegistrationRequest['status']): 'accent' | 'success' | 'neutral' {
  if (status === 'PENDING') return 'accent'
  if (status === 'APPROVED') return 'success'
  return 'neutral'
}

/**
 * `append: false` reloads from the top (first visit, filter change, after an
 * approve/reject); `append: true` is the "load more" button. A full page back
 * means there is probably more — that is what enables the button.
 */
async function loadRegistrations(append = false): Promise<void> {
  loadingRegistrations.value = true
  registrationsError.value = ''
  try {
    const offset = append ? registrations.value.length : 0
    const page = await adminRepository.listRegistrations(
      statusFilter.value === 'ALL' ? undefined : statusFilter.value,
      { limit: ADMIN_PAGE_SIZE, offset },
    )
    registrations.value = append ? [...registrations.value, ...page] : page
    hasMoreRegistrations.value = page.length === ADMIN_PAGE_SIZE
  } catch {
    registrationsError.value = 'Հայտերը բեռնել չհաջողվեց։'
  } finally {
    loadingRegistrations.value = false
  }
}

async function loadReviews(append = false): Promise<void> {
  loadingReviews.value = true
  reviewsError.value = ''
  try {
    const offset = append ? reviews.value.length : 0
    const page = await adminRepository.listPendingReviews({ limit: ADMIN_PAGE_SIZE, offset })
    reviews.value = append ? [...reviews.value, ...page] : page
    hasMoreReviews.value = page.length === ADMIN_PAGE_SIZE
  } catch {
    reviewsError.value = 'Կարծիքները բեռնել չհաջողվեց։'
  } finally {
    loadingReviews.value = false
  }
}

async function loadTowTrucks(append = false): Promise<void> {
  loadingTowTrucks.value = true
  towTrucksError.value = ''
  try {
    const offset = append ? towTrucks.value.length : 0
    const page = await adminRepository.listTowTrucks({ limit: ADMIN_PAGE_SIZE, offset })
    towTrucks.value = append ? [...towTrucks.value, ...page] : page
    hasMoreTowTrucks.value = page.length === ADMIN_PAGE_SIZE
  } catch {
    towTrucksError.value = 'Էվակուատորները բեռնել չհաջողվեց։'
  } finally {
    loadingTowTrucks.value = false
  }
}

/** Reversible — hides from public listing and blocks driver login, nothing is deleted */
async function toggleTowTruckActive(truck: AdminTowTruck): Promise<void> {
  const nextActive = !truck.isActive
  const verb = nextActive ? 'ակտիվացնե՞լ' : 'ապաակտիվացնե՞լ'
  if (!confirm(`${verb} ${truck.driverName}-ի պրոֆիլը։`)) return

  actioningId.value = truck.id
  try {
    const updated = await adminRepository.setTowTruckActive(truck.id, nextActive)
    truck.isActive = updated.isActive
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Կարգավիճակը փոխել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

/** Purely editorial — shows/hides this truck in the homepage "best tow trucks" section */
async function toggleTowTruckFeatured(truck: AdminTowTruck): Promise<void> {
  const nextFeatured = !truck.isFeatured

  actioningId.value = truck.id
  try {
    const updated = await adminRepository.setTowTruckFeatured(truck.id, nextFeatured)
    truck.isFeatured = updated.isFeatured
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Կարգավիճակը փոխել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

/**
 * Also doubles as "change Telegram account": generateTelegramLink() always
 * overwrites telegramLinkToken, and once the driver taps the fresh link,
 * linkTelegramChat() unconditionally overwrites telegramChatId too — so the
 * old Telegram account is silently replaced (it stops receiving OTP codes)
 * the moment the new one is linked. No separate "unlink" step needed.
 */
async function resendTelegramLink(truck: AdminTowTruck): Promise<void> {
  if (
    truck.hasTelegramLinked &&
    !confirm(
      `Փոխե՞լ ${truck.driverName}-ի Telegram-ը։ Նոր link ուղարկելուց և driver-ի կողմից ` +
        'սեղմելուց հետո հին Telegram-ը կդադարի աշխատել, մուտքի կոդերն այլևս այնտեղ չեն գա։',
    )
  ) {
    return
  }

  actioningId.value = truck.id
  try {
    const result = await adminRepository.regenerateTelegramLink(truck.id)
    telegramLinkUrl.value = result.telegramLinkUrl
    telegramLinkCopied.value = false
    telegramLinkModalTitle.value = truck.hasTelegramLinked ? 'Նոր Telegram link' : 'Telegram link'
    telegramLinkModalOpen.value = true
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Link-ը վերականգնել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

/** Id of the truck whose main phone is currently being edited inline (at most one row at a time) */
const editingPhoneId = ref<number | null>(null)
const phoneEditValue = ref('')
const phoneEditError = ref('')
const savingPhone = ref(false)

/** v-model wrapper that keeps the inline edit field locked to +374 + up to 8 digits */
const phoneEditModel = computed<string>({
  get: () => phoneEditValue.value,
  set: (value) => {
    phoneEditValue.value = armenianPhoneInputValue(value)
  },
})

function startEditPhone(truck: AdminTowTruck): void {
  editingPhoneId.value = truck.id
  phoneEditValue.value = truck.phone
  phoneEditError.value = ''
}

function cancelEditPhone(): void {
  editingPhoneId.value = null
  phoneEditValue.value = ''
  phoneEditError.value = ''
}

/**
 * The main phone doubles as the driver-login key (see DriverAuthService), so
 * changing it here immediately changes which number that driver must use to
 * log in — the confirm() dialog makes that explicit. Backend re-checks
 * uniqueness against other active trucks (see AdminService.setTowTruckPhone).
 */
async function savePhone(truck: AdminTowTruck): Promise<void> {
  phoneEditError.value = validateField(phoneEditValue.value, [required(), isPhone()]) ?? ''
  if (phoneEditError.value) return

  if (phoneEditValue.value === truck.phone) {
    cancelEditPhone()
    return
  }

  if (
    !confirm(
      `Փոխե՞լ ${truck.driverName}-ի հիմնական հեռախոսահամարը (${truck.phone} → ${phoneEditValue.value})։ ` +
        'Սա driver-ի մուտքի հեռախոսահամարն է. հին համարով այլևս մուտք գործել հնարավոր չի լինի։',
    )
  ) {
    return
  }

  savingPhone.value = true
  try {
    const updated = await adminRepository.setTowTruckPhone(truck.id, phoneEditValue.value)
    truck.phone = updated.phone
    cancelEditPhone()
  } catch (error) {
    phoneEditError.value = extractErrorMessage(error, 'Հեռախոսահամարը փոխել չհաջողվեց։')
  } finally {
    savingPhone.value = false
  }
}

/**
 * Which tow truck's analytics panel is expanded (at most one at a time).
 *
 * Lazily mounted rather than rendered for every row: each panel issues four API
 * requests, so eagerly loading them would mean 4×N requests every time an admin
 * opens this page. Collapsing unmounts the panel, so re-expanding refetches —
 * which is the behaviour an admin wants anyway (fresh numbers, not a cached view
 * from ten minutes ago).
 */
const analyticsTruckId = ref<number | null>(null)

function toggleAnalytics(truck: AdminTowTruck): void {
  analyticsTruckId.value = analyticsTruckId.value === truck.id ? null : truck.id
}

/** Irreversible — deletes the truck, its images (DB + Supabase Storage), reviews and OTPs */
async function deleteTowTruck(truck: AdminTowTruck): Promise<void> {
  const confirmed = confirm(
    `Ջնջե՞լ ${truck.driverName}-ի («${truck.slug}») ամբողջ պրոֆիլը։ Այս գործողությունը ՉԻ ՀԵՏԱՐԿՎՈՒՄ. ` +
      'նկարները, կարծիքները և մուտքի պատմությունը ընդմիշտ կջնջվեն։ Եթե ուղղակի ուզում ես ժամանակավորապես թաքցնել, ' +
      'օգտագործիր "Ապաակտիվացնել" կոճակը փոխարենը։',
  )
  if (!confirmed) return

  actioningId.value = truck.id
  try {
    await adminRepository.deleteTowTruck(truck.id)
    towTrucks.value = towTrucks.value.filter((item) => item.id !== truck.id)
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Ջնջել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

onMounted(() => {
  if (!apiEnabled || !adminAuth.isLoggedIn) return
  void loadRegistrations()
  void loadReviews()
  void loadTowTrucks()
})

watch(statusFilter, () => {
  if (apiEnabled) void loadRegistrations()
})

/* ── Reject registration ── */
async function rejectRegistration(request: AdminRegistrationRequest): Promise<void> {
  if (!confirm(`Մերժե՞լ ${request.firstName} ${request.lastName}-ի հայտը։`)) return

  actioningId.value = request.id
  try {
    await adminRepository.rejectRegistration(request.id)
    await loadRegistrations()
  } catch (error) {
    registrationsError.value = extractErrorMessage(error, 'Մերժել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

/* ── Approve registration (modal form) ── */
const approveModalOpen = ref(false)
const approveTarget = ref<AdminRegistrationRequest | null>(null)
const approveForm = reactive({
  slug: '',
  locationName: '',
  description: '',
})
const approveError = ref('')
const approveSubmitting = ref(false)
const telegramLinkModalOpen = ref(false)
const telegramLinkModalTitle = ref('')
const telegramLinkUrl = ref('')
const telegramLinkCopied = ref(false)

function openApprove(request: AdminRegistrationRequest): void {
  approveTarget.value = request
  approveForm.slug = ''
  // Pre-filled as a starting suggestion from the driver's first service area —
  // admin overwrites by hand when the truck's actual base differs (e.g. driver
  // covers all of Yerevan but is usually parked in a specific district, or a
  // village that isn't in our predefined city/district list at all).
  approveForm.locationName = request.citySlugs[0] ? cityOrDistrictLabel(request.citySlugs[0]) : ''
  approveForm.description = ''
  approveError.value = ''
  approveModalOpen.value = true
}

async function submitApprove(): Promise<void> {
  if (!approveTarget.value) return

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(approveForm.slug)) {
    approveError.value = 'Slug-ը պետք է լինի լատինատառ, kebab-case (օր.՝ ashot-tow-service)'
    return
  }
  if (!approveForm.locationName.trim()) {
    approveError.value = 'Վայրի անվանումը պարտադիր է'
    return
  }

  // A request can now carry up to 2 regionSlugs (e.g. Yerevan + Kotayk), so
  // citySlugs can be a MIX of real cities and Yerevan districts — a single
  // "isYerevan" flag for the whole request would mislabel half of them.
  // Each slug's own type has to be resolved individually instead.
  // resolveAreaType, not a local two-branch guess: with road corridors in the
  // mix, "anything that isn't a district is a city" would label
  // «Գառնի–Գեղարդ» a city and drop it into city search results.

  // The driver already gave us everything else at registration — capacity as
  // a range (see representativeCapacityTons) and the full service-area list
  // (citySlugs). The admin only adds what registration *can't* provide: a
  // unique slug and the truck's actual base location as free text.
  // The structural placement must be a real place — a truck cannot be based in
  // a road corridor, and a corridor slug in `citySlug` would file the driver
  // under a city page that does not exist. A driver covering only corridors
  // simply has no placement; both columns are nullable and the region rollup
  // in servesRegion() is what keeps them findable.
  const primarySlug = approveTarget.value.citySlugs.find(
    (slug) => resolveAreaType(slug) !== LocationType.Route,
  )
  const primaryType = primarySlug ? resolveAreaType(primarySlug) : undefined
  // TowTruck.regionSlug (the "best-effort" browsing fallback — see
  // docs/data-model.md) is resolved from the PRIMARY slug's actual region,
  // not just "the" region the driver picked first — the backend has no
  // geography data to do this itself (see CLAUDE.md).
  const primaryRegionSlug =
    primaryType === LocationType.City ? findCityLocation(primarySlug as string)?.regionSlug : undefined
  // No platform dimensions in this payload: the request stores them as the
  // same two Float columns the TowTruck does, so AdminService.approve() copies
  // them across directly. Nothing to parse and nothing for this form to ask.
  const payload: ApproveRegistrationPayload = {
    slug: approveForm.slug,
    capacityTons: representativeCapacityTons(approveTarget.value.capacityRange),
    locationName: approveForm.locationName.trim(),
    description: approveForm.description.trim() || undefined,
    ...(primaryType === LocationType.District
      ? { districtSlug: primarySlug }
      : primaryType === LocationType.City
        ? { citySlug: primarySlug }
        : {}),
    regionSlug: primaryRegionSlug,
    // Resolve each slug to its real Armenian name here — the backend has no
    // geography data of its own (see schema.prisma), so if we sent raw
    // slugs it would just store them as-is and the public profile would
    // show "ashtarak" instead of "Աշտարակ".
    serviceAreas: approveTarget.value.citySlugs.map((slug) => ({
      slug,
      name: cityOrDistrictLabel(slug),
      type: resolveAreaType(slug),
    })),
  }

  approveSubmitting.value = true
  approveError.value = ''
  try {
    const result = await adminRepository.approveRegistration(approveTarget.value.id, payload)
    approveModalOpen.value = false
    await loadRegistrations()

    telegramLinkUrl.value = result.telegramLinkUrl
    telegramLinkCopied.value = false
    telegramLinkModalTitle.value = 'Պրոֆիլը ստեղծված է'
    telegramLinkModalOpen.value = true
  } catch (error) {
    approveError.value = extractErrorMessage(error, 'Հաստատել չհաջողվեց, ստուգիր դաշտերը։')
  } finally {
    approveSubmitting.value = false
  }
}

async function copyTelegramLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(telegramLinkUrl.value)
    telegramLinkCopied.value = true
  } catch {
    telegramLinkCopied.value = false
  }
}

/* ── Reviews ── */
async function approveReview(review: AdminReview): Promise<void> {
  actioningId.value = review.id
  try {
    await adminRepository.approveReview(review.id)
    reviews.value = reviews.value.filter((item) => item.id !== review.id)
  } catch (error) {
    reviewsError.value = extractErrorMessage(error, 'Հաստատել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

async function rejectReview(review: AdminReview): Promise<void> {
  if (!confirm(`Ջնջե՞լ ${review.authorName}-ի կարծիքը։`)) return

  actioningId.value = review.id
  try {
    await adminRepository.rejectReview(review.id)
    reviews.value = reviews.value.filter((item) => item.id !== review.id)
  } catch (error) {
    reviewsError.value = extractErrorMessage(error, 'Ջնջել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}
</script>

<template>
  <div class="container admin-page">
    <header class="admin-page__header">
      <h1>Ադմին վահանակ</h1>
      <AppButton v-if="adminAuth.isLoggedIn" variant="outline" size="sm" @click="logout">
        Դուրս գալ
      </AppButton>
    </header>

    <EmptyState
      v-if="!apiEnabled"
      title="Backend API-ն միացված չէ"
      description="NUXT_PUBLIC_API_BASE_URL փոփոխականը դատարկ է, ուստի կայքն աշխատում է mock տվյալներով։ Ադմին վահանակն իմաստ ունի միայն իրական backend-ի հետ։"
      icon="info"
    />

    <div v-else-if="!adminAuth.isLoggedIn" class="admin-login">
      <form v-if="loginStep === 'credentials'" class="admin-login__form" @submit.prevent="submitCredentials">
        <AppInput v-model="loginEmail" type="email" label="Email" required />
        <AppInput v-model="loginPassword" type="password" label="Գաղտնաբառ" required />
        <p v-if="loginError" class="admin-error">{{ loginError }}</p>
        <AppButton type="submit" variant="success" block :disabled="loginSubmitting">
          {{ loginSubmitting ? 'Ստուգվում է…' : 'Մուտք' }}
        </AppButton>
      </form>

      <form v-else class="admin-login__form" @submit.prevent="submitCode">
        <p class="admin-login__hint">Մուտքի կոդն ուղարկվեց Ձեր Telegram-ին։</p>
        <AppInput v-model="loginCode" type="text" label="6-նիշանոց կոդ" placeholder="123456" required />
        <p v-if="loginError" class="admin-error">{{ loginError }}</p>
        <AppButton type="submit" variant="success" block :disabled="loginSubmitting">
          {{ loginSubmitting ? 'Ստուգվում է…' : 'Հաստատել' }}
        </AppButton>
        <AppButton variant="ghost" block type="button" @click="backToCredentials">Հետ</AppButton>
      </form>
    </div>

    <template v-else>
      <!-- Site traffic first: it's the question the panel gets opened for -->
      <section class="admin-section">
        <div class="admin-section__header">
          <h2>Կայքի այցելություններ</h2>
        </div>
        <SiteAnalyticsPanel />
      </section>

      <!-- ── Registration requests ── -->
      <section class="admin-section">
        <div class="admin-section__header">
          <h2>Գրանցման հայտեր</h2>
          <AppSelect
            v-model="statusFilter"
            :options="statusOptions"
            placeholder="Կարգավիճակ"
            class="admin-section__filter"
          />
        </div>

        <p v-if="registrationsError" class="admin-error">{{ registrationsError }}</p>

        <LoadingSkeleton v-if="loadingRegistrations" variant="text" :count="4" />

        <EmptyState
          v-else-if="registrations.length === 0"
          title="Այս կարգավիճակով հայտեր չկան"
          icon="truck"
        />

        <div v-else class="admin-cards">
          <article v-for="request in registrations" :key="request.id" class="admin-card">
            <header class="admin-card__header">
              <div>
                <h3>{{ request.firstName }} {{ request.lastName }}</h3>
                <p v-if="request.companyName" class="admin-card__muted">{{ request.companyName }}</p>
              </div>
              <AppBadge :variant="statusBadgeVariant(request.status)">
                {{ statusOptions.find((option) => option.value === request.status)?.label }}
              </AppBadge>
            </header>

            <dl class="admin-card__grid">
              <div>
                <dt>Հեռախոս</dt>
                <dd>{{ request.phone }}</dd>
              </div>
              <div>
                <dt>Մեքենա</dt>
                <dd>{{ request.vehicleBrand }} {{ request.vehicleModel }} ({{ request.vehicleYear }})</dd>
              </div>
              <div>
                <dt>Տեսակ</dt>
                <dd>{{ vehicleTypeLabel(request.vehicleType) }}</dd>
              </div>
              <div>
                <dt>Մարզեր</dt>
                <dd>
                  {{ request.regionSlugs.map(regionLabel).join(', ') }} —
                  {{ request.citySlugs.map(cityOrDistrictLabel).join(', ') }}
                </dd>
              </div>
              <div class="admin-card__grid-full">
                <dt>Ծառայություններ</dt>
                <dd>{{ request.services.map(serviceLabel).join(', ') }}</dd>
              </div>
              <div v-if="request.workingHoursText">
                <dt>Աշխատանքային ժամեր</dt>
                <dd>{{ request.workingHoursText }}</dd>
              </div>
            </dl>

            <div v-if="request.images.length" class="admin-card__images">
              <button
                v-for="(image, index) in request.images"
                :key="image.id"
                type="button"
                class="admin-card__image-btn"
                aria-label="Մեծացնել նկարը"
                @click="openLightbox(request.images.map((i) => i.url), index)"
              >
                <img :src="image.url" loading="lazy" alt="">
              </button>
            </div>

            <footer class="admin-card__footer">
              <span class="admin-card__muted">{{ formatDate(request.createdAt) }}</span>
              <div v-if="request.status === 'PENDING'" class="admin-card__actions">
                <AppButton
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === request.id"
                  @click="rejectRegistration(request)"
                >
                  Մերժել
                </AppButton>
                <AppButton
                  variant="success"
                  size="sm"
                  :disabled="actioningId === request.id"
                  @click="openApprove(request)"
                >
                  Հաստատել
                </AppButton>
              </div>
            </footer>
          </article>
        </div>

        <div v-if="hasMoreRegistrations" class="admin-section__more">
          <AppButton variant="outline" :disabled="loadingRegistrations" @click="loadRegistrations(true)">
            {{ loadingRegistrations ? 'Բեռնվում է…' : 'Ցույց տալ ավելին' }}
          </AppButton>
        </div>
      </section>

      <!-- ── Reviews ── -->
      <section class="admin-section">
        <div class="admin-section__header">
          <h2>Կարծիքներ՝ մոդերացիայի սպասող</h2>
        </div>

        <p v-if="reviewsError" class="admin-error">{{ reviewsError }}</p>

        <LoadingSkeleton v-if="loadingReviews" variant="text" :count="3" />

        <EmptyState v-else-if="reviews.length === 0" title="Սպասող կարծիքներ չկան" icon="check" />

        <div v-else class="admin-cards">
          <article v-for="review in reviews" :key="review.id" class="admin-card">
            <header class="admin-card__header">
              <div>
                <h3>{{ review.authorName }}</h3>
                <p class="admin-card__muted">
                  {{ review.towTruck.driverName }} (/tow-trucks/{{ review.towTruck.slug }})
                </p>
              </div>
              <AppBadge variant="primary">{{ review.rating }} / 5</AppBadge>
            </header>

            <p class="admin-card__text">{{ review.text }}</p>
            <p v-if="review.cityName" class="admin-card__muted">{{ review.cityName }}</p>

            <footer class="admin-card__footer">
              <span class="admin-card__muted">{{ formatDate(review.createdAt) }}</span>
              <div class="admin-card__actions">
                <AppButton
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === review.id"
                  @click="rejectReview(review)"
                >
                  Ջնջել
                </AppButton>
                <AppButton
                  variant="success"
                  size="sm"
                  :disabled="actioningId === review.id"
                  @click="approveReview(review)"
                >
                  Հաստատել
                </AppButton>
              </div>
            </footer>
          </article>
        </div>

        <div v-if="hasMoreReviews" class="admin-section__more">
          <AppButton variant="outline" :disabled="loadingReviews" @click="loadReviews(true)">
            {{ loadingReviews ? 'Բեռնվում է…' : 'Ցույց տալ ավելին' }}
          </AppButton>
        </div>
      </section>

      <!-- ── Tow trucks (active + deactivated) ── -->
      <section class="admin-section">
        <div class="admin-section__header">
          <h2>Էվակուատորներ</h2>
        </div>

        <p v-if="towTrucksError" class="admin-error">{{ towTrucksError }}</p>

        <LoadingSkeleton v-if="loadingTowTrucks" variant="text" :count="3" />

        <EmptyState v-else-if="towTrucks.length === 0" title="Դեռ ոչ մի էվակուատոր չկա" icon="truck" />

        <div v-else class="admin-cards">
          <article
            v-for="truck in towTrucks"
            :key="truck.id"
            class="admin-card"
            :class="{ 'admin-card--inactive': !truck.isActive }"
          >
            <header class="admin-card__header">
              <div>
                <h3>{{ truck.driverName }}</h3>
                <p class="admin-card__muted">
                  {{ truck.vehicleBrand }} {{ truck.vehicleModel }} ({{ truck.vehicleYear }}) ·
                  {{ truck.locationName }} ·
                  <NuxtLink :to="`/tow-trucks/${truck.slug}`">/tow-trucks/{{ truck.slug }}</NuxtLink>
                </p>
              </div>
              <div class="admin-card__badges">
                <AppBadge :variant="truck.isActive ? 'success' : 'neutral'">
                  {{ truck.isActive ? 'Ակտիվ' : 'Ապաակտիվացված' }}
                </AppBadge>
                <AppBadge v-if="truck.isFeatured" variant="accent">Լավագույններից</AppBadge>
              </div>
            </header>

            <dl class="admin-card__grid">
              <div>
                <dt>Հեռախոս</dt>
                <dd v-if="editingPhoneId !== truck.id" class="admin-card__phone-view">
                  {{ truck.phone }}
                  <button type="button" class="admin-card__link-btn" @click="startEditPhone(truck)">
                    Խմբագրել
                  </button>
                </dd>
                <dd v-else class="admin-card__phone-edit">
                  <AppInput
                    v-model="phoneEditModel"
                    type="tel"
                    placeholder="+37491000001"
                    :maxlength="12"
                    :error="phoneEditError"
                  />
                  <div class="admin-card__phone-edit-actions">
                    <AppButton
                      variant="primary"
                      size="sm"
                      :disabled="savingPhone"
                      @click="savePhone(truck)"
                    >
                      Պահպանել
                    </AppButton>
                    <AppButton
                      variant="outline"
                      size="sm"
                      :disabled="savingPhone"
                      @click="cancelEditPhone"
                    >
                      Չեղարկել
                    </AppButton>
                  </div>
                </dd>
              </div>
              <div>
                <dt>Telegram</dt>
                <dd>{{ truck.hasTelegramLinked ? 'Կապակցված ✓' : 'Կապակցված չէ' }}</dd>
              </div>
            </dl>

            <div v-if="truck.images.length" class="admin-card__images">
              <button
                v-for="(image, index) in truck.images"
                :key="image.id"
                type="button"
                class="admin-card__image-btn"
                aria-label="Մեծացնել նկարը"
                @click="openLightbox(truck.images.map((i) => i.url), index)"
              >
                <img :src="image.url" loading="lazy" alt="">
              </button>
            </div>

            <footer class="admin-card__footer">
              <span class="admin-card__muted">{{ formatDate(truck.createdAt) }}</span>
              <div class="admin-card__actions">
                <AppButton
                  :variant="analyticsTruckId === truck.id ? 'primary' : 'outline'"
                  size="sm"
                  @click="toggleAnalytics(truck)"
                >
                  {{ analyticsTruckId === truck.id ? 'Փակել վիճակագրությունը' : 'Վիճակագրություն' }}
                </AppButton>
                <AppButton
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === truck.id"
                  @click="toggleTowTruckActive(truck)"
                >
                  {{ truck.isActive ? 'Ապաակտիվացնել' : 'Ակտիվացնել' }}
                </AppButton>
                <AppButton
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === truck.id"
                  @click="toggleTowTruckFeatured(truck)"
                >
                  {{ truck.isFeatured ? 'Հանել լավագույններից' : 'Ավելացնել լավագույններին' }}
                </AppButton>
                <AppButton
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === truck.id"
                  @click="resendTelegramLink(truck)"
                >
                  {{ truck.hasTelegramLinked ? 'Փոխել Telegram-ը' : 'Ուղարկել Telegram link' }}
                </AppButton>
                <AppButton
                  variant="danger"
                  size="sm"
                  :disabled="actioningId === truck.id"
                  @click="deleteTowTruck(truck)"
                >
                  Ջնջել ամբողջությամբ
                </AppButton>
              </div>
            </footer>

            <!-- Exactly the component the driver sees in their own /dashboard,
                 pointed at this truck's admin endpoints — so admin and driver can
                 never be looking at differently-computed numbers. -->
            <div v-if="analyticsTruckId === truck.id" class="admin-card__analytics">
              <AnalyticsDashboard scope="admin" :tow-truck-id="truck.id" />
            </div>
          </article>
        </div>

        <div v-if="hasMoreTowTrucks" class="admin-section__more">
          <AppButton variant="outline" :disabled="loadingTowTrucks" @click="loadTowTrucks(true)">
            {{ loadingTowTrucks ? 'Բեռնվում է…' : 'Ցույց տալ ավելին' }}
          </AppButton>
        </div>
      </section>
    </template>

    <AppModal v-model="approveModalOpen" title="Հաստատել հայտը">
      <form class="approve-form" @submit.prevent="submitApprove">
        <AppInput
          v-model="approveForm.slug"
          label="Slug (latin, kebab-case)"
          placeholder="ashot-tow-service"
          required
        />
        <AppInput
          v-model="approveForm.locationName"
          label="Որտե՞ղ է սովորաբար կանգնում (ցուցադրվում է պրոֆիլում և քարտերի վրա)"
          placeholder="Օր.՝ Նոր Նորք, կամ ցանկում չեղած գյուղի անուն"
          required
        />
        <AppInput v-model="approveForm.description" label="Նկարագրություն (ոչ պարտադիր)" />

        <p v-if="approveError" class="admin-error">{{ approveError }}</p>

        <AppButton type="submit" variant="success" block :disabled="approveSubmitting">
          {{ approveSubmitting ? 'Հաստատվում է…' : 'Հաստատել և ստեղծել պրոֆիլ' }}
        </AppButton>
      </form>
    </AppModal>

    <AppModal v-model="telegramLinkModalOpen" :title="telegramLinkModalTitle">
      <p>
        Ուղարկիր այս link-ը վարորդին (Telegram/WhatsApp-ով) — մեկ սեղմումով նրա Telegram-ը
        կապակցվում է, հետո login-ի կոդերը կստանա այնտեղ։ Link-ը վավեր է 7 օր։
      </p>
      <div class="telegram-link-box">
        <code>{{ telegramLinkUrl }}</code>
      </div>
      <AppButton variant="success" block @click="copyTelegramLink">
        {{ telegramLinkCopied ? 'Պատճենված է ✓' : 'Պատճենել link-ը' }}
      </AppButton>
    </AppModal>

    <Teleport to="body">
      <div
        v-if="lightboxOpen"
        class="admin-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Նկարի մեծացված տեսք"
        @click.self="closeLightbox"
      >
        <button type="button" class="admin-lightbox__close" aria-label="Փակել" @click="closeLightbox">
          <AppIcon name="close" :size="26" />
        </button>

        <button
          v-if="lightboxHasMultiple"
          type="button"
          class="admin-lightbox__nav admin-lightbox__nav--prev"
          aria-label="Նախորդ նկարը"
          @click.stop="lightboxPrev"
        >
          <AppIcon name="chevron-left" :size="28" />
        </button>

        <img :src="lightboxImage" alt="" class="admin-lightbox__img" @click.stop>

        <button
          v-if="lightboxHasMultiple"
          type="button"
          class="admin-lightbox__nav admin-lightbox__nav--next"
          aria-label="Հաջորդ նկարը"
          @click.stop="lightboxNext"
        >
          <AppIcon name="chevron-right" :size="28" />
        </button>

        <p v-if="lightboxHasMultiple" class="admin-lightbox__count">
          {{ lightboxIndex + 1 }} / {{ lightboxImages.length }}
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.admin-page {
  padding-top: var(--space-6);
  padding-bottom: var(--space-8);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-5);

    h1 {
      margin: 0;
    }
  }
}

.admin-login {
  display: flex;
  justify-content: center;
  padding: var(--space-7) 0;

  &__form {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
  }

  &__hint {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    margin: 0;
  }
}

.admin-section {
  margin-bottom: var(--space-7);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;

    h2 {
      margin: 0;
    }
  }

  &__more {
    display: flex;
    justify-content: center;
    margin-top: var(--space-4);
  }

  &__filter {
    min-width: 180px;
  }
}

.admin-error {
  color: var(--color-danger);
  margin-bottom: var(--space-3);
}

.admin-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.admin-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);

  &--inactive {
    opacity: 0.65;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);

    h3 {
      margin: 0 0 var(--space-1);
    }
  }

  &__muted {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    margin: 0;
  }

  &__badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  &__text {
    margin: 0 0 var(--space-3);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    margin: 0 0 var(--space-4);

    dt {
      font-size: 0.78rem;
      color: var(--color-text-secondary);
      margin-bottom: 2px;
    }

    dd {
      margin: 0;
      font-weight: 500;
    }
  }

  &__grid-full {
    grid-column: 1 / -1;
  }

  &__phone-view {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  &__link-btn {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-primary);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  &__phone-edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-width: 220px;
  }

  &__phone-edit-actions {
    display: flex;
    gap: var(--space-2);
  }

  &__images {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }

  &__image-btn {
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    cursor: zoom-in;
    background: none;
    line-height: 0;

    img {
      width: 84px;
      height: 84px;
      object-fit: cover;
      border-radius: var(--radius-md);
      display: block;
    }
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  /* Expanded analytics panel — sits on the page background so it reads as a
     drawer belonging to this card rather than more card content. */
  &__analytics {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  &__actions {
    display: flex;
    gap: var(--space-2);
    max-width: 100%;
    overflow-x: auto;
    padding-bottom: var(--space-1);
    -webkit-overflow-scrolling: touch;

    // Buttons keep their natural width and scroll as a strip instead of
    // wrapping/squishing or being clipped by the page's overflow-x: hidden.
    > * {
      flex-shrink: 0;
    }
  }
}

.approve-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.telegram-link-box {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin: var(--space-4) 0;
  word-break: break-all;
  font-size: 0.9rem;
}

/* Shared full-size viewer for the request/tow-truck thumbnail grids above —
   see TowTruckGallery.vue's lightbox for the same pattern on the public site. */
.admin-lightbox {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 18, 30, 0.92);

  &__img {
    max-width: min(92vw, 1100px);
    max-height: 86vh;
    object-fit: contain;
    border-radius: var(--radius-sm);
  }

  &__close {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.22);
    }
  }

  &__nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.22);
    }

    &--prev {
      left: var(--space-3);
    }

    &--next {
      right: var(--space-3);
    }

    @media (min-width: 640px) {
      width: 52px;
      height: 52px;
    }
  }

  &__count {
    position: absolute;
    bottom: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 0.85rem;
  }
}
</style>
