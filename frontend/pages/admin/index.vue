<script setup lang="ts">
import { FetchError } from 'ofetch'
import { TELEGRAM_MESSAGE_MAX_LENGTH } from '~/constants/admin'
import { SERVICE_LABELS } from '~/constants/services'
import { SITE_NAME } from '~/constants/site'
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import {
  adminAuthRepository,
  adminRepository,
  isApiEnabled,
  type AdminProfileChange,
  type AdminRegistrationRequest,
  type AdminReview,
  type AdminServiceArea,
  type AdminTowTruck,
  type AdminTowTruckCounts,
  type BroadcastCandidate,
  type PasswordCandidate,
} from '~/repositories'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { LocationType, VehicleType } from '~/types/enums'
import type { ServiceType } from '~/types/enums'
import { formatCoordinates } from '~/utils/coordinates'
import type { DeactivationReason } from '~/types/subscription'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateNumeric } from '~/utils/formatters'
import { armenianPhoneInputValue } from '~/utils/formatPhone'
import {
  buildCityOptions,
  buildRegionOptions,
  cityOrDistrictLabel,
  findCityLocation,
  regionLabel,
} from '~/utils/geography'
import { towTruckLocationParams } from '~/utils/adminTowTruckLocation'
import { composeLocationName, placementFor } from '~/utils/primaryArea'
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
  await Promise.all([loadRegistrations(), loadProfileChanges(), loadReviews(), loadTowTrucks()])
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
  // The dialog holds a reference to a row from the list that was just dropped,
  // so it has to go with it — otherwise logging out with it open leaves a
  // driver's name and slug on screen behind the login form.
  coordinatesDialogOpen.value = false
  coordinatesTarget.value = null
}

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

const statusOptions = [
  { value: 'PENDING', label: 'Սպասող' },
  { value: 'APPROVED', label: 'Հաստատված' },
  { value: 'REJECTED', label: 'Մերժված' },
  { value: 'ALL', label: 'Բոլորը' },
]

type TowTruckTypeFilter = VehicleType | 'ALL'

/** 'ALL' plus the same four types the registration form's own select offers */
const towTruckTypeOptions = [
  { value: 'ALL', label: 'Բոլոր տեսակները' },
  ...Object.values(VehicleType).map((type) => ({ value: type, label: VEHICLE_TYPE_LABELS[type] })),
]

const towTruckTypeFilter = ref<TowTruckTypeFilter>('ALL')

/**
 * Base-location filter for the tow-trucks list — same marz → settlement
 * cascade the hero search uses (`buildRegionOptions`/`buildCityOptions`,
 * see `useLocationSearch`), but local state rather than the shared
 * `useLocationStore`: this narrows the admin table in place, it does not
 * navigate anywhere.
 *
 * '' means "no filter" for both — `towTruckCityOptions` is empty and the
 * select disabled until a marz is chosen, same as `PrimaryAreaPicker`.
 */
const towTruckRegionFilter = ref('')
const towTruckCityFilter = ref('')

const towTruckRegionOptions = computed(() => buildRegionOptions())
const towTruckCityOptions = computed(() =>
  towTruckRegionFilter.value ? buildCityOptions(towTruckRegionFilter.value) : [],
)

/** Changing the marz invalidates whatever settlement was chosen under the old one */
watch(towTruckRegionFilter, () => {
  towTruckCityFilter.value = ''
})


/**
 * Admin listings are paginated server-side (see backend AdminListQuery): these
 * tables only ever grow, and the panel was refetching every row ever created on
 * each visit. One page at a time, "load more" for the rest.
 */
const ADMIN_PAGE_SIZE = 50

/**
 * Mirrors `RejectProfileChangeDto`'s own floor.
 *
 * A manual sync point, and a shallow one: the backend rejects a shorter reason
 * outright, so the only thing this buys is that a moderator learns it while
 * typing rather than from a failed request. Raising it here alone is advisory;
 * raising it there alone means the textarea accepts what the API refuses.
 */
const REJECT_REASON_MIN_LENGTH = 10

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
const exportingDrivers = ref(false)
const exportDriversError = ref('')

/**
 * Totals across every page, straight from the database.
 *
 * `towTrucks.value.length` cannot stand in for this: the list is paginated, so
 * it only ever says how many rows have been fetched so far — 50 until someone
 * presses "show more". Null while it has not loaded, or if it failed, in which
 * case the header simply omits the number instead of showing a wrong one.
 */
const towTruckCounts = ref<AdminTowTruckCounts | null>(null)

/**
 * Sending temporary passwords over Telegram.
 *
 * ## Why this is a picker and not a button
 *
 * It was one button that sent to every eligible driver at once. That is the
 * wrong shape for the only action on this page whose effect leaves the system —
 * a Telegram message cannot be unsent, and staging's database is a copy of
 * production's, real chat ids and all. So the panel loads the candidates,
 * shows exactly who is on the list, and sends to the ones an admin ticked.
 *
 * Nothing is fetched until the modal is opened: this list is only interesting
 * during a migration, and every other visit to /admin should not pay for it.
 */
const passwordModalOpen = ref(false)
const passwordCandidates = ref<PasswordCandidate[]>([])
const loadingCandidates = ref(false)
const candidatesError = ref('')
/** Ids ticked in the modal. A Set, so the per-row toggle is O(1) and order is irrelevant. */
const selectedForPassword = ref<Set<number>>(new Set())
const issuingPasswords = ref(false)
const issuePasswordsResult = ref('')

const allCandidatesSelected = computed(
  () =>
    passwordCandidates.value.length > 0 &&
    selectedForPassword.value.size === passwordCandidates.value.length,
)

async function openPasswordModal(): Promise<void> {
  passwordModalOpen.value = true
  candidatesError.value = ''
  issuePasswordsResult.value = ''
  // Nothing pre-ticked. The default for an irreversible outbound action has to
  // be "send to nobody" — a pre-filled list turns one stray click into dozens
  // of real messages.
  selectedForPassword.value = new Set()
  loadingCandidates.value = true
  try {
    passwordCandidates.value = await adminRepository.listPasswordCandidates()
  } catch (err) {
    candidatesError.value = extractErrorMessage(err, 'Ցուցակը բեռնել չհաջողվեց։')
    passwordCandidates.value = []
  } finally {
    loadingCandidates.value = false
  }
}

function toggleCandidate(id: number, checked: boolean): void {
  // Replaced, not mutated: Vue does not track Set mutations, so `.add()` alone
  // would update the data and never re-render the checkbox that caused it.
  const next = new Set(selectedForPassword.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedForPassword.value = next
}

function toggleAllCandidates(checked: boolean): void {
  selectedForPassword.value = checked
    ? new Set(passwordCandidates.value.map((candidate) => candidate.id))
    : new Set()
}

/**
 * Confirmed by name and count before sending, unlike the other actions here:
 * this is the one that cannot be undone from inside the system. Everything else
 * on this page (activate, reject, even delete) is a database change.
 */
async function sendPasswords(): Promise<void> {
  const ids = [...selectedForPassword.value]
  if (ids.length === 0) return

  if (
    !confirm(
      `Ուղարկե՞լ ժամանակավոր գաղտնաբառ ${ids.length} վարորդի։ ` +
        'Յուրաքանչյուրը կստանա Telegram հաղորդագրություն, որը հետ կանչել հնարավոր չէ։',
    )
  ) {
    return
  }

  issuePasswordsResult.value = ''
  issuingPasswords.value = true
  try {
    const result = await adminRepository.issuePasswords(ids)

    const parts = [`Ուղարկվեց ${result.issued} վարորդի։`]
    if (result.failed.length > 0) {
      parts.push(`Ձախողվեց ${result.failed.length}՝ ${result.failed.map((f) => f.slug).join(', ')}։`)
    }
    // Worth surfacing rather than hiding: it means the list was stale, which
    // tells an admin the reload below is not optional.
    if (result.skipped > 0) parts.push(`${result.skipped}-ն այլևս ցուցակում չէր։`)
    issuePasswordsResult.value = parts.join(' ')

    // Re-read rather than filter locally: everyone just sent now has a
    // password, so they are no longer candidates, and the server is the only
    // thing that knows which of them actually went through.
    selectedForPassword.value = new Set()
    passwordCandidates.value = await adminRepository.listPasswordCandidates()
  } catch (err) {
    issuePasswordsResult.value = extractErrorMessage(err, 'Չհաջողվեց ուղարկել գաղտնաբառերը')
  } finally {
    issuingPasswords.value = false
  }
}

/**
 * The admin broadcast: one free-text message, sent verbatim over Telegram to
 * every active, Telegram-linked driver an admin explicitly ticks.
 *
 * Same picker discipline as the password modal above, and for the same
 * reason — a Telegram message cannot be unsent, and staging's database is a
 * copy of production's, real chat ids and all. No "send to everyone" call
 * exists on the backend at all; this always names its recipients.
 */
const broadcastModalOpen = ref(false)
const broadcastCandidates = ref<BroadcastCandidate[]>([])
const loadingBroadcastCandidates = ref(false)
const broadcastCandidatesError = ref('')
const broadcastMessage = ref('')
/** Ids ticked in the modal. A Set, same reasoning as selectedForPassword. */
const selectedForBroadcast = ref<Set<number>>(new Set())
const sendingBroadcast = ref(false)
const broadcastResult = ref('')

const allBroadcastCandidatesSelected = computed(
  () =>
    broadcastCandidates.value.length > 0 &&
    selectedForBroadcast.value.size === broadcastCandidates.value.length,
)

const broadcastMessageTooLong = computed(
  () => broadcastMessage.value.length > TELEGRAM_MESSAGE_MAX_LENGTH,
)

async function openBroadcastModal(): Promise<void> {
  broadcastModalOpen.value = true
  broadcastCandidatesError.value = ''
  broadcastResult.value = ''
  broadcastMessage.value = ''
  // Nothing pre-ticked — same reasoning as openPasswordModal: the default for
  // an irreversible outbound action has to be "send to nobody".
  selectedForBroadcast.value = new Set()
  loadingBroadcastCandidates.value = true
  try {
    broadcastCandidates.value = await adminRepository.listBroadcastCandidates()
  } catch (err) {
    broadcastCandidatesError.value = extractErrorMessage(err, 'Ցուցակը բեռնել չհաջողվեց։')
    broadcastCandidates.value = []
  } finally {
    loadingBroadcastCandidates.value = false
  }
}

function toggleBroadcastCandidate(id: number, checked: boolean): void {
  const next = new Set(selectedForBroadcast.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedForBroadcast.value = next
}

function toggleAllBroadcastCandidates(checked: boolean): void {
  selectedForBroadcast.value = checked
    ? new Set(broadcastCandidates.value.map((candidate) => candidate.id))
    : new Set()
}

/**
 * Confirmed by exact count before sending, same as sendPasswords — this is
 * the other action on this page whose effect leaves the system and cannot be
 * undone from inside it.
 */
async function sendBroadcast(): Promise<void> {
  const ids = [...selectedForBroadcast.value]
  const text = broadcastMessage.value.trim()
  if (ids.length === 0 || !text || broadcastMessageTooLong.value) return

  if (
    !confirm(
      `Ուղարկե՞լ այս հաղորդագրությունը ${ids.length} վարորդի Telegram-ով։ ` +
        'Հետ կանչել հնարավոր չէ։',
    )
  ) {
    return
  }

  broadcastResult.value = ''
  sendingBroadcast.value = true
  try {
    const result = await adminRepository.broadcastMessage(text, ids)

    const parts = [`Ուղարկվեց ${result.sent} վարորդի։`]
    if (result.failed.length > 0) {
      parts.push(`Ձախողվեց ${result.failed.length}՝ ${result.failed.map((f) => f.slug).join(', ')}։`)
    }
    if (result.skipped > 0) parts.push(`${result.skipped}-ն այլևս ցուցակում չէր։`)
    broadcastResult.value = parts.join(' ')

    // Cleared on success, same as sendPasswords — the recipients just got
    // this exact text, so leaving it in the box invites a duplicate send.
    broadcastMessage.value = ''
    selectedForBroadcast.value = new Set()
  } catch (err) {
    broadcastResult.value = extractErrorMessage(err, 'Չհաջողվեց ուղարկել հաղորդագրությունը')
  } finally {
    sendingBroadcast.value = false
  }
}

/**
 * Full-size image viewer for the request and tow-truck thumbnail grids — an
 * admin needs to actually see what was uploaded, not a 84x84 thumbnail.
 *
 * The overlay itself is `AdminImageLightbox`, shared with the review page at
 * `/admin/registrations/:id`. One global instance rather than one per card,
 * since only one can ever be open at a time.
 */
const lightboxImages = ref<string[]>([])
const lightboxIndex = ref(0)
const lightboxOpen = ref(false)

function openLightbox(images: string[], index: number): void {
  lightboxImages.value = images
  lightboxIndex.value = index
  lightboxOpen.value = true
}

function serviceLabel(slug: string): string {
  return SERVICE_LABELS[slug as ServiceType] ?? slug
}

function vehicleTypeLabel(slug: string): string {
  return VEHICLE_TYPE_LABELS[slug as VehicleType] ?? slug
}

const formatDate = formatDateNumeric

function statusBadgeVariant(status: AdminRegistrationRequest['status']): 'accent' | 'success' | 'neutral' {
  if (status === 'PENDING') return 'accent'
  if (status === 'APPROVED') return 'success'
  return 'neutral'
}

/**
 * The "Ցույց տալ ավելին" buttons below bind `:disabled="loading*"`, which
 * turns true the instant their own click handler starts — disabling the
 * exact button that still has focus from the click. Several browsers respond
 * to a focused element becoming disabled by moving focus to `<body>`, which
 * resets the page's scroll position to the very top — the opposite of what
 * "load more" should feel like, since the driver was reading the bottom of
 * the list. Capturing the offset right before the disable and restoring it
 * one tick later (after Vue patches the DOM, before the next paint) cancels
 * that jump without changing how the button itself behaves.
 */
async function preserveScrollAfterDisable(scrollY: number): Promise<void> {
  await nextTick()
  window.scrollTo({ top: scrollY })
}

/**
 * `append: false` reloads from the top (first visit, filter change, after an
 * approve/reject); `append: true` is the "load more" button. A full page back
 * means there is probably more — that is what enables the button.
 */
async function loadRegistrations(append = false): Promise<void> {
  const scrollY = window.scrollY
  loadingRegistrations.value = true
  registrationsError.value = ''
  void preserveScrollAfterDisable(scrollY)
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
  const scrollY = window.scrollY
  loadingReviews.value = true
  reviewsError.value = ''
  void preserveScrollAfterDisable(scrollY)
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

/**
 * Its own request with its own try/catch: the totals are a header decoration,
 * and a failure here must never surface as "the tow trucks could not be
 * loaded" over a list that loaded perfectly well.
 */
async function loadTowTruckCounts(): Promise<void> {
  try {
    towTruckCounts.value = await adminRepository.getTowTruckCounts()
  } catch {
    towTruckCounts.value = null
  }
}

async function loadTowTrucks(append = false): Promise<void> {
  // Appending adds a page to a list whose total has not changed — only a fresh
  // load needs the counts, and it fires alongside rather than before the list.
  if (!append) void loadTowTruckCounts()

  const scrollY = window.scrollY
  loadingTowTrucks.value = true
  towTrucksError.value = ''
  void preserveScrollAfterDisable(scrollY)
  try {
    const offset = append ? towTrucks.value.length : 0
    const page = await adminRepository.listTowTrucks({
      limit: ADMIN_PAGE_SIZE,
      offset,
      vehicleType: towTruckTypeFilter.value === 'ALL' ? undefined : towTruckTypeFilter.value,
      ...towTruckLocationParams(towTruckRegionFilter.value, towTruckCityFilter.value),
    })
    towTrucks.value = append ? [...towTrucks.value, ...page] : page
    hasMoreTowTrucks.value = page.length === ADMIN_PAGE_SIZE
  } catch {
    towTrucksError.value = 'Էվակուատորները բեռնել չհաջողվեց։'
  } finally {
    loadingTowTrucks.value = false
  }
}

/**
 * Downloads the full driver list as CSV — every published driver, active and
 * deactivated, not just the page currently loaded above (`towTrucks` is
 * paginated and "load more"'d; the export is one separate backend request
 * that reads the whole table).
 *
 * `apiFetch` returns the response as a `Blob` (see `exportDrivers`'s own
 * comment) — turned into a temporary object URL and clicked via a detached
 * `<a download>`, the standard way to save an authenticated fetch response as
 * a file: a plain `<a href="/admin/tow-trucks/export.csv">` could not carry
 * the admin's Authorization header at all.
 */
async function downloadDriversCsv(): Promise<void> {
  exportDriversError.value = ''
  exportingDrivers.value = true
  try {
    const blob = await adminRepository.exportDrivers()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'varordner.csv'
    link.click()
    // Deferred, not immediate: revoking the URL synchronously can race the
    // browser's own read of it for the download it was just asked to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    exportDriversError.value = extractErrorMessage(error, 'CSV-ն ներբեռնել չհաջողվեց։')
  } finally {
    exportingDrivers.value = false
  }
}

/** Reversible — hides from public listing and blocks driver login, nothing is deleted */
async function toggleTowTruckActive(truck: AdminTowTruck): Promise<void> {
  const nextActive = !truck.isActive
  // Deactivating asks WHY first — the answer decides whether this driver can
  // sign in again (see DeactivateReasonDialog). Reactivating asks nothing:
  // there is only one way to be active.
  if (!nextActive) {
    deactivateTarget.value = truck
    deactivateError.value = ''
    deactivateDialogOpen.value = true
    return
  }
  if (!confirm(`Ակտիվացնե՞լ ${truck.driverName}-ի պրոֆիլը։`)) return

  actioningId.value = truck.id
  try {
    const updated = await adminRepository.setTowTruckActive(truck.id, nextActive)
    truck.isActive = updated.isActive
    // The total is unchanged, but the active/inactive split just moved. Refetched
    // rather than adjusted locally so the header cannot drift from the database.
    void loadTowTruckCounts()
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Կարգավիճակը փոխել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

const deactivateDialogOpen = ref(false)
const deactivateTarget = ref<AdminTowTruck | null>(null)
const deactivateSubmitting = ref(false)
const deactivateError = ref('')

async function confirmDeactivate(reason: DeactivationReason): Promise<void> {
  const truck = deactivateTarget.value
  if (!truck) return

  deactivateSubmitting.value = true
  deactivateError.value = ''
  try {
    const updated = await adminRepository.setTowTruckActive(truck.id, false, reason)
    truck.isActive = updated.isActive
    deactivateDialogOpen.value = false
    // The total is unchanged, but the active/inactive split just moved.
    void loadTowTruckCounts()
  } catch (error) {
    deactivateError.value = extractErrorMessage(error, 'Կարգավիճակը փոխել չհաջողվեց։')
  } finally {
    deactivateSubmitting.value = false
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
 * Whether the «Ծանր տեխնիկա» box is settled by the vehicle type rather than by
 * the admin. Ticked and locked for those trucks — «Ծանր տեխնիկայի էվակուատոր»
 * is the same claim in the words of the taxonomy, so there is no "off" state
 * for it, and the backend derives `true` regardless of what is sent.
 */
function isHeavyEquipmentLocked(truck: AdminTowTruck): boolean {
  return truck.vehicleType === VehicleType.HeavyDuty
}

/**
 * NOT editorial, unlike the featured toggle above: this decides whether the
 * truck appears on /tsanr-tehnika for every visitor.
 *
 * Assigns what the server returned rather than what was sent, because the
 * value is derived — see AdminService.setTowTruckHeavyEquipment.
 */
async function toggleTowTruckHeavyEquipment(truck: AdminTowTruck): Promise<void> {
  if (isHeavyEquipmentLocked(truck)) return

  actioningId.value = truck.id
  try {
    const updated = await adminRepository.setTowTruckHeavyEquipment(
      truck.id,
      !truck.heavyEquipment,
    )
    truck.heavyEquipment = updated.heavyEquipment
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
 * old Telegram account is silently replaced (it stops receiving notices) the
 * moment the new one is linked. No separate "unlink" step needed.
 *
 * Tapping the link may also mint a NEW password — but only for a driver who
 * has not yet set one of their own. That asymmetry is the security rule of the
 * whole handover (see docs/auth-and-security.md), so the confirm below states
 * it rather than promising either outcome: an admin pressing this cannot tell
 * from the panel which of the two applies, and guessing wrong in the copy is
 * how a driver gets told their password changed when it did not.
 */
async function resendTelegramLink(truck: AdminTowTruck): Promise<void> {
  if (
    truck.hasTelegramLinked &&
    !confirm(
      `Փոխե՞լ ${truck.driverName}-ի Telegram-ը։ Նոր link-ը սեղմելուց հետո հին Telegram-ը ` +
        'կդադարի աշխատել՝ ծանուցումներն այլևս այնտեղ չեն գա։ Եթե վարորդը դեռ չի փոխել ' +
        'իր ժամանակավոր գաղտնաբառը, կստանա նորը։',
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
    telegramLinkModalHint.value = LINK_HINT_ONBOARDING
    telegramLinkModalOpen.value = true
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Link-ը վերականգնել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

/**
 * Revokes the driver's password and shows the link that replaces it.
 *
 * The confirm names the lockout rather than the reset, because that is the part
 * an admin can get wrong: the driver cannot log in from the moment this returns
 * until they tap the link, and nothing here can put the old password back. The
 * modal that follows is the recovery, which is why it opens immediately and
 * carries its own wording (LINK_HINT_RESET) rather than the onboarding one.
 *
 * `hasPassword` is set to false locally rather than refetching the whole list:
 * the backend has just guaranteed it, and reloading would scroll a long admin
 * table back to the top mid-task. It goes true again on the next load, once the
 * driver has actually tapped the link — which is a fact only the backend knows.
 */
async function resetDriverPassword(truck: AdminTowTruck): Promise<void> {
  if (
    !confirm(
      `Զրոյացնե՞լ ${truck.driverName}-ի գաղտնաբառը։ Հին գաղտնաբառը կջնջվի անմիջապես, և ` +
        'վարորդը մուտք գործել չի կարողանա այնքան ժամանակ, մինչև չսեղմի նոր link-ը։ ' +
        'Link-ը կհայտնվի հաջորդ պատուհանում — պարտադիր ուղարկիր իրեն։',
    )
  ) {
    return
  }

  actioningId.value = truck.id
  try {
    const result = await adminRepository.resetDriverPassword(truck.id)
    truck.hasPassword = false
    telegramLinkUrl.value = result.telegramLinkUrl
    telegramLinkCopied.value = false
    telegramLinkModalTitle.value = 'Նոր գաղտնաբառի link'
    telegramLinkModalHint.value = LINK_HINT_RESET
    telegramLinkModalOpen.value = true
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Գաղտնաբառը զրոյացնել չհաջողվեց։')
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

/* ── Base parking coordinates ────────────────────────────────────────────────
 *
 * The admin's copy of the same dialog the driver gets in /dashboard. It exists
 * because a driver who pastes the pair in the wrong order (or from the wrong
 * place entirely) has no way to notice on their own — the value never appears
 * on their public profile — so support needs to be able to fix it without
 * asking them to log in.
 *
 * Unlike the phone edit above, this is NOT an admin-only field: the driver owns
 * it too, and both paths go through the same validation and the same message
 * set (see utils/coordinates.ts).
 */
const coordinatesTarget = ref<AdminTowTruck | null>(null)
const coordinatesDialogOpen = ref(false)
const savingCoordinates = ref(false)
const coordinatesError = ref('')

/** The truck whose dialog is open, formatted for the input's initial value */
const coordinatesInitialValue = computed(() =>
  formatCoordinates(coordinatesTarget.value?.latitude, coordinatesTarget.value?.longitude),
)

function truckCoordinates(truck: AdminTowTruck): string {
  return formatCoordinates(truck.latitude, truck.longitude)
}

function openCoordinatesDialog(truck: AdminTowTruck): void {
  coordinatesTarget.value = truck
  coordinatesError.value = ''
  coordinatesDialogOpen.value = true
}

/**
 * On success the row is patched in place rather than the whole list refetched:
 * nothing else about it moved, and reloading the page would scroll an admin
 * away from the truck they were working on. On failure the dialog stays open
 * holding what was typed, with the backend's own message under the field.
 */
async function saveCoordinates(coordinates: Coordinates): Promise<void> {
  const truck = coordinatesTarget.value
  if (!truck) return

  savingCoordinates.value = true
  coordinatesError.value = ''
  try {
    const updated = await adminRepository.setTowTruckCoordinates(
      truck.id,
      coordinates.latitude,
      coordinates.longitude,
    )
    // From the response, not from what was sent — the column is DECIMAL(9,6),
    // so this is what actually got stored.
    truck.latitude = updated.latitude
    truck.longitude = updated.longitude
    truck.locationUpdatedAt = updated.locationUpdatedAt
    coordinatesDialogOpen.value = false
    coordinatesTarget.value = null
  } catch (error) {
    coordinatesError.value = extractErrorMessage(error, 'Կոորդինատները պահպանել չհաջողվեց։')
  } finally {
    savingCoordinates.value = false
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

/**
 * The per-truck base editor — the already-approved counterpart of the picker in
 * the approval modal.
 *
 * It has to exist because before it there was no way to correct a base at all:
 * approval inferred it from whichever served area came first, and the driver's
 * own dashboard re-derived it the same way on every save, so a wrong value
 * re-created itself. Since city pages now rank locally-based drivers first, a
 * wrong base is not a cosmetic typo — it puts the wrong driver at the top of a
 * town's results.
 */
const primaryAreaTruckId = ref<number | null>(null)
const primaryAreaForm = reactive({ slug: '', settlement: '' })
const primaryAreaError = ref('')
const savingPrimaryArea = ref(false)

function openPrimaryArea(truck: AdminTowTruck): void {
  // Toggle: the same button closes it, matching how the analytics panel behaves
  // two rows down.
  if (primaryAreaTruckId.value === truck.id) {
    primaryAreaTruckId.value = null
    return
  }

  primaryAreaTruckId.value = truck.id
  // Pre-selected from what is stored, so an admin opening this to change the
  // village does not have to re-pick a town that was already right.
  primaryAreaForm.slug = truck.citySlug ?? truck.districtSlug ?? ''
  // The village half is deliberately NOT recovered from `locationName`. It
  // would mean parsing a composed string back apart, and a legacy label that
  // never followed the format would parse into nonsense. Empty means "state it
  // again if it applies", which is a question, not a silent wrong answer.
  primaryAreaForm.settlement = ''
  primaryAreaError.value = ''
}

async function savePrimaryArea(truck: AdminTowTruck): Promise<void> {
  if (!primaryAreaForm.slug) {
    primaryAreaError.value = 'Ընտրեք հիմնական բնակավայրը'
    return
  }

  savingPrimaryArea.value = true
  primaryAreaError.value = ''
  try {
    const updated = await adminRepository.setTowTruckPrimaryArea(truck.id, {
      ...placementFor(primaryAreaForm.slug),
      locationName: composeLocationName(
        // The stored name, so the label matches the words already on the
        // driver's public profile rather than a freshly looked-up synonym.
        truck.serviceAreas.find((area) => area.slug === primaryAreaForm.slug)?.name ??
          cityOrDistrictLabel(primaryAreaForm.slug),
        primaryAreaForm.settlement,
      ),
    })

    truck.locationName = updated.locationName
    truck.citySlug = updated.citySlug
    truck.districtSlug = updated.districtSlug
    truck.regionSlug = updated.regionSlug
    primaryAreaTruckId.value = null
  } catch (error) {
    primaryAreaError.value = extractErrorMessage(error, 'Հիմնական տարածքը պահպանել չհաջողվեց։')
  } finally {
    savingPrimaryArea.value = false
  }
}

/**
 * Which area is mid-removal — keyed by `${truckId}:${slug}` because one row can
 * hold several areas and only the clicked chip should show as busy.
 */
const removingAreaKey = ref<string | null>(null)

function areaKey(truckId: number, slug: string): string {
  return `${truckId}:${slug}`
}

/**
 * Removes one served area from an approved driver.
 *
 * ## The placement problem, solved here rather than on the backend
 *
 * `citySlug`/`districtSlug` is what the browsing pages filter on, and it must
 * always name one of the served areas. So when the area being removed IS the
 * truck's placement, a replacement has to be chosen — and choosing one means
 * knowing which remaining slug is a real settlement and which is a road
 * corridor («Գառնի–Գեղարդ» is coverage, not an address). That is geography,
 * which lives only here (CLAUDE.md), so this is the only side that can answer.
 *
 * The derivation is deliberately the same one `approve()` and the driver's own
 * dashboard use — first surviving area that is not a corridor — so a truck ends
 * up filed identically no matter which of the three paths last touched it.
 *
 * The backend still checks the answer against the list it is about to store; it
 * cannot resolve a placement, but it can refuse one that is not among the
 * remaining areas.
 */
async function removeServiceArea(truck: AdminTowTruck, area: AdminServiceArea): Promise<void> {
  // Refused before the request rather than after: the backend rejects this too,
  // but an admin should not have to send a doomed call to learn that emptying
  // the coverage is not how you hide a driver.
  if (truck.serviceAreas.length <= 1) {
    towTrucksError.value =
      'Էվակուատորը պետք է սպասարկի առնվազն մեկ տարածք։ Պրոֆիլն ամբողջությամբ թաքցնելու համար օգտագործիր «Ապաակտիվացնել» կոճակը։'
    return
  }

  const remaining = truck.serviceAreas.filter((item) => item.slug !== area.slug)
  const losesPlacement = truck.citySlug === area.slug || truck.districtSlug === area.slug

  // Only computed when it is actually needed. Sending a placement on every
  // removal would be a second, silent way to relocate a driver — the backend
  // ignores it in that case for exactly that reason, and so does this.
  const replacement = losesPlacement
    ? remaining.find((item) => item.type !== LocationType.Route)
    : undefined

  const confirmed = confirm(
    `Հեռացնե՞լ «${area.name}»-ը ${truck.driverName}-ի սպասարկվող տարածքներից։\n\n` +
      'Հաստատելուց հետո այդ տարածքը կհեռանա նաև վարորդի պրոֆիլից, և նա այլևս չի երևա ' +
      'այդ վայրի որոնման արդյունքներում։ Վարորդն ինքը կարող է այն հետ ավելացնել իր էջից։' +
      (losesPlacement
        ? replacement
          ? `\n\nՈւշադրություն. սա էվակուատորի հիմնական տեղակայումն է — այն կփոխվի «${replacement.name}»-ի։`
          : '\n\nՈւշադրություն. սա էվակուատորի հիմնական տեղակայումն է, և մնացած տարածքներից ոչ մեկը քաղաք կամ շրջան չէ, ուստի հիմնական տեղակայումը կմնա դատարկ։'
        : ''),
  )
  if (!confirmed) return

  removingAreaKey.value = areaKey(truck.id, area.slug)
  towTrucksError.value = ''
  try {
    const updated = await adminRepository.removeTowTruckServiceArea(truck.id, {
      slug: area.slug,
      ...(replacement
        ? replacement.type === LocationType.District
          ? { districtSlug: replacement.slug }
          : {
              citySlug: replacement.slug,
              regionSlug: findCityLocation(replacement.slug)?.regionSlug,
            }
        : {}),
    })

    // Patched in place from the response, not from `remaining` — the backend is
    // the one that decided the final placement, and re-reading its answer keeps
    // the row honest if it ever differs from what was predicted here.
    truck.serviceAreas = updated.serviceAreas
    truck.citySlug = updated.citySlug
    truck.districtSlug = updated.districtSlug
    truck.regionSlug = updated.regionSlug
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Տարածքը հեռացնել չհաջողվեց։')
  } finally {
    removingAreaKey.value = null
  }
}

/** Irreversible — deletes the truck, its images (DB + Supabase Storage) and reviews */
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
    void loadTowTruckCounts()
  } catch (error) {
    towTrucksError.value = extractErrorMessage(error, 'Ջնջել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

/* ── Driver profile edits awaiting review ── */

/**
 * A second queue, beside the registration one.
 *
 * They are deliberately not merged: one decides whether a driver joins the
 * platform, the other whether a change to an already-published listing goes
 * live. Different bodies, different consequences, different urgency — and a
 * moderator reading both in one list would have no way to work through either.
 */
const profileChanges = ref<AdminProfileChange[]>([])
const loadingProfileChanges = ref(false)
const profileChangesError = ref('')

async function loadProfileChanges(): Promise<void> {
  loadingProfileChanges.value = true
  profileChangesError.value = ''
  try {
    profileChanges.value = await adminRepository.listProfileChanges({ limit: ADMIN_PAGE_SIZE })
  } catch (error) {
    profileChangesError.value = extractErrorMessage(error, 'Փոփոխությունները բեռնել չհաջողվեց։')
  } finally {
    loadingProfileChanges.value = false
  }
}

async function approveProfileChange(change: AdminProfileChange): Promise<void> {
  actioningId.value = change.id
  profileChangesError.value = ''
  try {
    await adminRepository.approveProfileChange(change.id)
    // Refetched rather than filtered out locally: approving runs the driver's
    // own write path, which can legitimately fail on a rule that only holds at
    // write time — so the list has to come back from the server rather than
    // being assumed correct.
    await loadProfileChanges()
  } catch (error) {
    profileChangesError.value = extractErrorMessage(error, 'Հաստատել չհաջողվեց։')
  } finally {
    actioningId.value = null
  }
}

const rejectModalOpen = ref(false)
const rejectTarget = ref<AdminProfileChange | null>(null)
const rejectReason = ref('')
const rejectError = ref('')
const rejectSubmitting = ref(false)

function openReject(change: AdminProfileChange): void {
  rejectTarget.value = change
  rejectReason.value = ''
  rejectError.value = ''
  rejectModalOpen.value = true
}

async function submitReject(): Promise<void> {
  if (!rejectTarget.value) return
  // Mirrors the backend's own floor. Checked here too so a moderator learns it
  // before the round trip, not from a validation error afterwards — the reason
  // is the only thing that tells a driver which change was the problem.
  if (rejectReason.value.trim().length < REJECT_REASON_MIN_LENGTH) {
    rejectError.value = `Գրեք մերժման պատճառը (առնվազն ${REJECT_REASON_MIN_LENGTH} նիշ)`
    return
  }

  rejectSubmitting.value = true
  rejectError.value = ''
  try {
    await adminRepository.rejectProfileChange(rejectTarget.value.id, rejectReason.value.trim())
    rejectModalOpen.value = false
    await loadProfileChanges()
  } catch (error) {
    rejectError.value = extractErrorMessage(error, 'Մերժել չհաջողվեց։')
  } finally {
    rejectSubmitting.value = false
  }
}

onMounted(() => {
  if (!apiEnabled || !adminAuth.isLoggedIn) return
  void loadRegistrations()
  void loadProfileChanges()
  void loadReviews()
  void loadTowTrucks()
})

watch(statusFilter, () => {
  if (apiEnabled) void loadRegistrations()
})

watch(towTruckTypeFilter, () => {
  if (apiEnabled) void loadTowTrucks()
})

// `towTruckCityFilter` is reset by the region watcher above the instant the
// region changes, and Vue batches both into one tick — a single watcher here
// (rather than one per select) means changing the marz reloads exactly once,
// not once with the stale city and once more right after.
watch([towTruckRegionFilter, towTruckCityFilter], () => {
  if (apiEnabled) void loadTowTrucks()
})

/* ── Telegram link hand-off (shown after approval and after a reset) ── */
const telegramLinkModalOpen = ref(false)
const telegramLinkModalTitle = ref('')
/**
 * The sentence above the link, which is not the same sentence every time.
 *
 * The three entry points promise genuinely different things: onboarding and a
 * re-link only *may* hand over a password (a driver who already set their own
 * gets nothing — that asymmetry is the security rule of the whole handover),
 * while a reset has just guaranteed one by taking the old password away. Wording
 * that covered all three would have to hedge, and an admin forwarding it to a
 * driver would be hedging about whether they can still log in.
 */
const telegramLinkModalHint = ref('')
const telegramLinkUrl = ref('')
const telegramLinkCopied = ref(false)

const LINK_HINT_ONBOARDING =
  'Ուղարկիր այս link-ը վարորդին (Telegram/WhatsApp-ով) — մեկ սեղմումով նրա Telegram-ը ' +
  'կապակցվում է, և նույն պահին այնտեղ կստանա իր մուտքի գաղտնաբառը (եթե դեռ չունի իրենը)։ ' +
  'Link-ը վավեր է 7 օր։'

const LINK_HINT_RESET =
  'Գաղտնաբառը ջնջված է — վարորդն այս պահին մուտք գործել չի կարող։ Ուղարկիր այս link-ը ' +
  'իրեն (Telegram/WhatsApp-ով կամ գրանցման հեռախոսահամարին). սեղմելուց հետո Telegram-ում ' +
  'կստանա նոր ժամանակավոր գաղտնաբառ։ Link-ը վավեր է 7 օր։'

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
      <div v-if="adminAuth.isLoggedIn" class="admin-page__header-actions">
        <NuxtLink to="/admin/payments" class="admin-page__nav-link">Վճարումներ</NuxtLink>
        <AppButton variant="outline" size="sm" @click="logout">
          Դուրս գալ
        </AppButton>
      </div>
    </header>

    <EmptyState
      v-if="!apiEnabled"
      title="Backend API-ն միացված չէ"
      description="NUXT_PUBLIC_API_BASE_URL փոփոխականը դատարկ է, ուստի կայքն աշխատում է mock տվյալներով։ Ադմին վահանակն իմաստ ունի միայն իրական backend-ի հետ։"
      icon="info"
    />

    <div v-else-if="!adminAuth.isLoggedIn" class="admin-login">
      <form v-if="loginStep === 'credentials'" class="admin-login__form" @submit.prevent="submitCredentials">
        <!-- `username` rather than `email` on an email-typed field: the token
             names the ROLE in the credential pair, which is what lets a
             password manager store and offer the two together. `email` would
             file it as contact details instead. -->
        <AppInput v-model="loginEmail" type="email" label="Email" required autocomplete="username" />
        <AppInput
          v-model="loginPassword"
          type="password"
          label="Գաղտնաբառ"
          required
          autocomplete="current-password"
        />
        <p v-if="loginError" class="admin-error">{{ loginError }}</p>
        <AppButton type="submit" variant="success" block :disabled="loginSubmitting">
          {{ loginSubmitting ? 'Ստուգվում է…' : 'Մուտք' }}
        </AppButton>
      </form>

      <form v-else class="admin-login__form" @submit.prevent="submitCode">
        <p class="admin-login__hint">Մուտքի կոդն ուղարկվեց Ձեր Telegram-ին։</p>
        <!-- `one-time-code` is what lets a phone offer the code from the
             notification instead of making an admin retype it. It must never
             be `off` here: this field is the second factor, and the value is
             single-use, so there is nothing to leak by helping. -->
        <AppInput
          v-model="loginCode"
          type="text"
          label="6-նիշանոց կոդ"
          placeholder="123456"
          required
          autocomplete="one-time-code"
        />
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

        <!-- Gated on the list being EMPTY, not just on `loading`, or "Ցույց
             տալ ավելին" swaps 40 loaded cards for a 4-line skeleton the
             instant it's pressed. That shrinks the page far below the current
             scroll position, the browser clamps scrollY to the new (tiny) max
             — which reads as "jumped to the top" — and nothing scrolls it back
             down once the real page-length list returns, because no code ever
             asks it to. Kept for a genuine first load, where there is nothing
             yet to keep on screen. -->
        <LoadingSkeleton v-if="loadingRegistrations && registrations.length === 0" variant="text" :count="4" />

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
              <div class="admin-card__badges">
                <AppBadge :variant="statusBadgeVariant(request.status)">
                  {{ statusOptions.find((option) => option.value === request.status)?.label }}
                </AppBadge>
                <!-- Only while PENDING — see the identical note on the review
                     page for why an already-decided request always reads
                     `null` here regardless of what the driver actually did. -->
                <AppBadge
                  v-if="request.status === 'PENDING'"
                  :variant="request.privacyConsent ? 'success' : 'danger'"
                  :title="request.privacyConsent ? `Համաձայնել է ${formatDate(request.privacyConsent.acceptedAt)}` : ''"
                >
                  {{ request.privacyConsent ? 'Գաղտնիությանը համաձայն է' : 'Համաձայն չէ' }}
                </AppBadge>
              </div>
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
              <!-- One way in, deliberately. Approving used to be a dialog on
                   this card with four fields in it, which meant a moderator
                   decided on a driver from a five-line summary and could not
                   correct anything they noticed. Everything now happens on the
                   request's own page, where the whole profile is visible and
                   editable — including rejection, so that the decision to say
                   no is made from the same view as the decision to say yes. -->
              <div v-if="request.status === 'PENDING'" class="admin-card__actions">
                <AppButton
                  :to="`/admin/registrations/${request.id}`"
                  variant="success"
                  size="sm"
                >
                  Բացել և ստուգել
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

      <!-- ── Driver profile edits ── -->
      <section class="admin-section">
        <div class="admin-section__header">
          <h2>
            Պրոֆիլի փոփոխություններ
            <span v-if="profileChanges.length" class="admin-section__count">
              ({{ profileChanges.length }})
            </span>
          </h2>
        </div>

        <p class="admin-section__note">
          Վարորդների ուղարկած փոփոխությունները։ Կայքում ոչինչ չի փոխվել՝ մինչև հաստատումը։
          Ցուցադրվում է միայն այն, ինչ փոխվել է։
        </p>

        <p v-if="profileChangesError" class="admin-error" role="alert">{{ profileChangesError }}</p>

        <!-- Same skeleton rule as the lists above: only while there is nothing
             on screen yet. Replacing a populated list mid-refresh collapses the
             document and the browser clamps the scroll position to the top. -->
        <LoadingSkeleton
          v-if="loadingProfileChanges && profileChanges.length === 0"
          variant="text"
          :count="3"
        />

        <EmptyState
          v-else-if="profileChanges.length === 0"
          title="Սպասող փոփոխություններ չկան"
          icon="truck"
        />

        <div v-else class="admin-cards">
          <ProfileChangeCard
            v-for="change in profileChanges"
            :key="change.id"
            :change="change"
            :busy="actioningId === change.id"
            @approve="approveProfileChange(change)"
            @reject="openReject(change)"
          />
        </div>
      </section>

      <!-- ── Reviews ── -->
      <section class="admin-section">
        <div class="admin-section__header">
          <h2>Կարծիքներ՝ մոդերացիայի սպասող</h2>
        </div>

        <p v-if="reviewsError" class="admin-error">{{ reviewsError }}</p>

        <!-- Same "load more" scroll-jump reasoning as the registrations
             skeleton above — gated on empty, not just on `loading`. -->
        <LoadingSkeleton v-if="loadingReviews && reviews.length === 0" variant="text" :count="3" />

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
          <div>
            <h2>
              Էվակուատորներ
              <span v-if="towTruckCounts" class="admin-section__count">
                {{ towTruckCounts.total }}
              </span>
            </h2>
            <p v-if="towTruckCounts" class="admin-section__count-split">
              ակտիվ՝ {{ towTruckCounts.active }} · ապաակտիվացված՝
              {{ towTruckCounts.inactive }}
            </p>
          </div>

          <AppSelect
            v-model="towTruckTypeFilter"
            :options="towTruckTypeOptions"
            placeholder="Տեսակ"
            class="admin-section__filter"
          />

          <!-- Same marz → settlement cascade as everywhere else on the site
               (see towTruckLocationParams) — the city select stays empty and
               disabled until a marz is chosen, same as PrimaryAreaPicker. -->
          <AppSelect
            v-model="towTruckRegionFilter"
            :options="towTruckRegionOptions"
            placeholder="Բոլոր մարզերը"
            class="admin-section__filter"
          />
          <AppSelect
            v-model="towTruckCityFilter"
            :options="towTruckCityOptions"
            :placeholder="towTruckRegionFilter ? 'Ամբողջ մարզը' : 'Նախ ընտրեք մարզը'"
            :disabled="!towTruckRegionFilter"
            class="admin-section__filter"
          />

          <!-- Opens the picker; sends nothing on its own. See
               openPasswordModal() for why nothing is fetched until then. -->
          <AppButton variant="outline" size="sm" @click="openPasswordModal">
            Ուղարկել գաղտնաբառեր
          </AppButton>
          <!-- Same lazy-fetch discipline — see openBroadcastModal(). -->
          <AppButton variant="outline" size="sm" @click="openBroadcastModal">
            Ուղարկել հաղորդագրություն
          </AppButton>
          <!-- Every driver, one request — not just the page currently loaded
               above (which is paginated and "load more"'d). See downloadDriversCsv(). -->
          <AppButton variant="outline" size="sm" :disabled="exportingDrivers" @click="downloadDriversCsv">
            {{ exportingDrivers ? 'Ներբեռնվում է…' : 'Ներբեռնել CSV' }}
          </AppButton>
        </div>

        <p v-if="issuePasswordsResult" class="admin-hint">{{ issuePasswordsResult }}</p>
        <p v-if="broadcastResult" class="admin-hint">{{ broadcastResult }}</p>
        <p v-if="exportDriversError" class="admin-error">{{ exportDriversError }}</p>

        <p v-if="towTrucksError" class="admin-error">{{ towTrucksError }}</p>

        <!-- Same "load more" scroll-jump reasoning as the registrations
             skeleton above — gated on empty, not just on `loading`. -->
        <LoadingSkeleton v-if="loadingTowTrucks && towTrucks.length === 0" variant="text" :count="3" />

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

            <!-- Sits here rather than among the action buttons because it is not
                 an action on the profile — it is a property of the truck, and
                 the admin reads it far more often than they change it. -->
            <div class="admin-card__heavy">
              <AppCheckbox
                :model-value="truck.heavyEquipment"
                :disabled="isHeavyEquipmentLocked(truck) || actioningId === truck.id"
                label="Կարող է տեղափոխել ծանր տեխնիկա"
                @update:model-value="toggleTowTruckHeavyEquipment(truck)"
              />
              <p class="admin-card__hint">
                <template v-if="isHeavyEquipmentLocked(truck)">
                  Մեքենայի տեսակն արդեն «{{ vehicleTypeLabel(truck.vehicleType) }}» է, ուստի այս
                  նշումը միշտ միացված է և չի փոխվում։
                </template>
                <template v-else>
                  Միացնելիս այս էվակուատորը կհայտնվի «Ծանր տեխնիկա» էջում
                  (<NuxtLink to="/tsanr-tehnika">/tsanr-tehnika</NuxtLink>)։
                </template>
              </p>
            </div>

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
              <!-- Answers "who among the old, already-published drivers has
                   (still) done this and who hasn't" — the dashboard already
                   blocks the ones reading «Չի համաձայնվել» here on their next
                   login, this is just the panel's own view of the same fact. -->
              <div>
                <dt>Գաղտնիության համաձայնություն</dt>
                <dd>
                  <AppBadge
                    :variant="truck.privacyConsent ? 'success' : 'danger'"
                    :title="truck.privacyConsent ? `Համաձայնել է ${formatDate(truck.privacyConsent.acceptedAt)}` : ''"
                  >
                    {{ truck.privacyConsent ? 'Համաձայն է ✓' : 'Չի համաձայնվել' }}
                  </AppBadge>
                </dd>
              </div>
              <!-- Whether the driver can log in at all. Worth its own row
                   because "no password" is otherwise invisible in the panel and
                   is the answer to most «մուտք չեմ գործում» reports — a driver
                   who was approved and never tapped their link looks entirely
                   healthy here without it. -->
              <div>
                <dt>Գաղտնաբառ</dt>
                <dd>
                  <AppBadge :variant="truck.hasPassword ? 'success' : 'neutral'">
                    {{ truck.hasPassword ? 'Ունի ✓' : 'Չունի — link է պետք' }}
                  </AppBadge>
                </dd>
              </div>
              <!-- The base, shown next to the phone because it is now what
                   decides the truck's position on its own town's page. -->
              <div>
                <dt>Հիմնական տարածք</dt>
                <dd class="admin-card__phone-view">
                  <strong>{{ truck.locationName }}</strong>
                  <!-- Flagged rather than left blank: a truck with no placement
                       is filed under no city page at all, which is invisible
                       unless the row says so. -->
                  <AppBadge v-if="!truck.citySlug && !truck.districtSlug" variant="neutral">
                    նշված չէ
                  </AppBadge>
                  <button
                    type="button"
                    class="admin-card__link-btn"
                    @click="openPrimaryArea(truck)"
                  >
                    {{ primaryAreaTruckId === truck.id ? 'Փակել' : 'Փոխել' }}
                  </button>
                </dd>
              </div>
              <div>
                <dt>Կոորդինատներ</dt>
                <dd v-if="truckCoordinates(truck)">{{ truckCoordinates(truck) }}</dd>
                <!-- Muted rather than flagged: every driver approved before
                     this field existed has none, so this is the normal state
                     for most of the list, not a problem with the row. -->
                <dd v-else class="admin-card__muted">Տեղադիրքը նշված չէ</dd>
              </div>
            </dl>

            <!-- Same picker the approval modal uses, pointed at a truck that
                 already exists — and fed its OWN served areas, so the base can
                 only ever be somewhere it actually works. -->
            <div v-if="primaryAreaTruckId === truck.id" class="admin-card__primary-edit">
              <PrimaryAreaPicker
                v-model:slug="primaryAreaForm.slug"
                v-model:settlement="primaryAreaForm.settlement"
                :candidates="truck.serviceAreas"
                :error="primaryAreaError"
              />
              <div class="admin-card__phone-edit-actions">
                <AppButton
                  variant="primary"
                  size="sm"
                  :disabled="savingPrimaryArea"
                  @click="savePrimaryArea(truck)"
                >
                  Պահպանել
                </AppButton>
                <AppButton
                  variant="outline"
                  size="sm"
                  :disabled="savingPrimaryArea"
                  @click="primaryAreaTruckId = null"
                >
                  Չեղարկել
                </AppButton>
              </div>
            </div>

            <!-- Coverage. Until this existed there was no way at all to see an
                 approved driver's served areas from the panel — `locationName`
                 above is only the free-text base label, and the pending-request
                 card shows what was SUBMITTED, which stops matching reality the
                 moment the driver edits their own dashboard. -->
            <div class="admin-card__areas">
              <!-- Not a <dt>: this block sits outside the <dl> above, and a
                   stray <dt> with no <dl> parent is invalid markup. -->
              <p class="admin-card__areas-title">
                Սպասարկվող տարածքներ
                <span class="admin-card__areas-count">{{ truck.serviceAreas.length }}</span>
              </p>
              <p v-if="truck.serviceAreas.length === 0" class="admin-card__muted">
                Տարածքներ նշված չեն
              </p>
              <ul v-else class="admin-card__area-list">
                <li
                  v-for="area in truck.serviceAreas"
                  :key="area.slug"
                  class="admin-card__area"
                  :class="{
                    'admin-card__area--primary':
                      truck.citySlug === area.slug || truck.districtSlug === area.slug,
                  }"
                >
                  <span>{{ area.name }}</span>
                  <!-- The last one cannot be removed: an empty coverage list
                       matches no filter, so the driver would silently disappear
                       from every browsing page while still looking live here.
                       Disabled with a reason rather than hidden, so the rule is
                       discoverable instead of looking like a missing button. -->
                  <button
                    type="button"
                    class="admin-card__area-remove"
                    :disabled="
                      truck.serviceAreas.length <= 1 ||
                      removingAreaKey === areaKey(truck.id, area.slug)
                    "
                    :title="
                      truck.serviceAreas.length <= 1
                        ? 'Վերջին տարածքը հնարավոր չէ հեռացնել։ Օգտագործիր «Ապաակտիվացնել»։'
                        : `Հեռացնել «${area.name}»-ը`
                    "
                    :aria-label="`Հեռացնել «${area.name}»-ը սպասարկվող տարածքներից`"
                    @click="removeServiceArea(truck, area)"
                  >
                    ×
                  </button>
                </li>
              </ul>
            </div>

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
                <!-- Only offered when there is a password to take away. With
                     none, the honest action is the button above it — the reset
                     would revoke nothing and just arm a link, which is what
                     «Ուղարկել Telegram link» already does under a name that
                     describes it. -->
                <AppButton
                  v-if="truck.hasPassword"
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === truck.id"
                  @click="resetDriverPassword(truck)"
                >
                  Զրոյացնել գաղտնաբառը
                </AppButton>
                <AppButton
                  variant="outline"
                  size="sm"
                  :disabled="actioningId === truck.id"
                  @click="openCoordinatesDialog(truck)"
                >
                  {{ truckCoordinates(truck) ? 'Փոխել կոորդինատները' : 'Ավելացնել կոորդինատներ' }}
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

    <!-- The very same dialog the driver sees in /dashboard, pointed at this
         truck's admin endpoint. `show-guidance` is off because the Google Maps
         tutorial and the "an administrator will help you" note are both aimed
         at a driver doing this for the first time — and the second one is
         nonsense when you ARE the administrator. Everything else, including the
         accepted formats and every error message, is identical by
         construction. -->
    <CoordinatesDialog
      v-model="coordinatesDialogOpen"
      title="Էվակուատորի տեղադիրքի կոորդինատներ"
      :subject="coordinatesTarget ? `${coordinatesTarget.driverName} · /tow-trucks/${coordinatesTarget.slug}` : undefined"
      :initial-value="coordinatesInitialValue"
      :saving="savingCoordinates"
      :error="coordinatesError"
      :show-guidance="false"
      @save="saveCoordinates"
    />

    <AppModal v-model="telegramLinkModalOpen" :title="telegramLinkModalTitle">
      <!-- Set per entry point — onboarding/re-link only MAY hand over a
           password, a reset has already guaranteed one. See
           telegramLinkModalHint. -->
      <p>{{ telegramLinkModalHint }}</p>
      <div class="telegram-link-box">
        <code>{{ telegramLinkUrl }}</code>
      </div>
      <AppButton variant="success" block @click="copyTelegramLink">
        {{ telegramLinkCopied ? 'Պատճենված է ✓' : 'Պատճենել link-ը' }}
      </AppButton>
    </AppModal>

    <AppModal v-model="passwordModalOpen" title="Ուղարկել ժամանակավոր գաղտնաբառեր">
      <p class="password-picker__intro">
        Ցուցակում են այն վարորդները, ովքեր Telegram են կապակցել, բայց դեռ գաղտնաբառ չունեն։
        Նշիր, ում ուղարկել — միայն նշվածները կստանան հաղորդագրություն։
      </p>

      <LoadingSkeleton v-if="loadingCandidates" variant="text" :count="3" />

      <p v-else-if="candidatesError" class="admin-error">{{ candidatesError }}</p>

      <!-- Distinct from an error: nothing went wrong, everyone eligible already
           has a password. During a migration this is the finish line. -->
      <EmptyState
        v-else-if="passwordCandidates.length === 0"
        title="Ուղարկելու վարորդ չկա"
        description="Բոլոր կապակցված վարորդներն արդեն ունեն գաղտնաբառ։"
        icon="info"
      />

      <template v-else>
        <div class="password-picker__all">
          <AppCheckbox
            :model-value="allCandidatesSelected"
            :label="`Նշել բոլորը (${passwordCandidates.length})`"
            @update:model-value="toggleAllCandidates"
          />
        </div>

        <ul class="password-picker__list">
          <li v-for="candidate in passwordCandidates" :key="candidate.id">
            <AppCheckbox
              :model-value="selectedForPassword.has(candidate.id)"
              :label="candidate.driverName"
              @update:model-value="(checked) => toggleCandidate(candidate.id, checked)"
            />
            <!-- The phone, not the slug: it is the value the driver will type
                 into the login form, so it is what an admin needs to recognise
                 the right person and to read back over the phone if asked. -->
            <span class="password-picker__phone">{{ candidate.phone }}</span>
          </li>
        </ul>

        <AppButton
          variant="success"
          block
          :disabled="issuingPasswords || selectedForPassword.size === 0"
          @click="sendPasswords"
        >
          {{
            issuingPasswords
              ? 'Ուղարկվում է…'
              : selectedForPassword.size === 0
                ? 'Նշիր առնվազն մեկ վարորդ'
                : `Ուղարկել ${selectedForPassword.size} վարորդի`
          }}
        </AppButton>
      </template>

      <p v-if="issuePasswordsResult" class="admin-hint password-picker__result">
        {{ issuePasswordsResult }}
      </p>
    </AppModal>

    <AppModal v-model="broadcastModalOpen" title="Ուղարկել հաղորդագրություն">
      <p class="password-picker__intro">
        Տեքստն ուղարկվում է Telegram-ով, ինչպես գրված է, առանց փոփոխության։ Ցուցակում են
        միայն ակտիվ և Telegram կապակցված վարորդները — նշիր, ում ուղարկել։
      </p>

      <div class="broadcast-picker__field">
        <textarea
          v-model="broadcastMessage"
          class="broadcast-picker__textarea"
          rows="4"
          placeholder="Հաղորդագրության տեքստը…"
          :maxlength="TELEGRAM_MESSAGE_MAX_LENGTH"
        />
        <p
          class="broadcast-picker__counter"
          :class="{ 'broadcast-picker__counter--over': broadcastMessageTooLong }"
        >
          {{ broadcastMessage.length }} / {{ TELEGRAM_MESSAGE_MAX_LENGTH }}
        </p>
      </div>

      <LoadingSkeleton v-if="loadingBroadcastCandidates" variant="text" :count="3" />

      <p v-else-if="broadcastCandidatesError" class="admin-error">{{ broadcastCandidatesError }}</p>

      <!-- Distinct from an error: nothing went wrong, there just isn't anyone
           the broadcast can currently reach. -->
      <EmptyState
        v-else-if="broadcastCandidates.length === 0"
        title="Ուղարկելու վարորդ չկա"
        description="Ակտիվ և Telegram կապակցված վարորդ դեռ չկա։"
        icon="info"
      />

      <template v-else>
        <div class="password-picker__all">
          <AppCheckbox
            :model-value="allBroadcastCandidatesSelected"
            :label="`Նշել բոլորը (${broadcastCandidates.length})`"
            @update:model-value="toggleAllBroadcastCandidates"
          />
        </div>

        <ul class="password-picker__list">
          <li v-for="candidate in broadcastCandidates" :key="candidate.id">
            <AppCheckbox
              :model-value="selectedForBroadcast.has(candidate.id)"
              :label="candidate.driverName"
              @update:model-value="(checked) => toggleBroadcastCandidate(candidate.id, checked)"
            />
            <span class="password-picker__phone">{{ candidate.phone }}</span>
          </li>
        </ul>

        <AppButton
          variant="success"
          block
          :disabled="
            sendingBroadcast ||
            selectedForBroadcast.size === 0 ||
            !broadcastMessage.trim() ||
            broadcastMessageTooLong
          "
          @click="sendBroadcast"
        >
          {{
            sendingBroadcast
              ? 'Ուղարկվում է…'
              : selectedForBroadcast.size === 0
                ? 'Նշիր առնվազն մեկ վարորդ'
                : `Ուղարկել ${selectedForBroadcast.size} վարորդի`
          }}
        </AppButton>
      </template>

      <p v-if="broadcastResult" class="admin-hint password-picker__result">
        {{ broadcastResult }}
      </p>
    </AppModal>

    <!-- The reason is required, and the driver is shown it verbatim in Telegram
         and on their dashboard. An unexplained refusal leaves them to guess
         which change was the problem, and the likeliest next move is to submit
         the same thing again. -->
    <AppModal v-model="rejectModalOpen" title="Մերժել փոփոխությունը">
      <form class="reject-form" @submit.prevent="submitReject">
        <p class="admin-card__muted">
          {{ rejectTarget?.driverName }} — վարորդը կստանա այս պատճառը Telegram-ով և իր էջում։
        </p>
        <label for="reject-reason" class="reject-form__label">Մերժման պատճառը</label>
        <textarea
          id="reject-reason"
          v-model="rejectReason"
          class="reject-form__textarea"
          rows="4"
          maxlength="500"
          placeholder="Օր.՝ Նշված բեռնատարողությունը չի համապատասխանում մեքենային։"
        />
        <p v-if="rejectError" class="admin-error" role="alert">{{ rejectError }}</p>
        <AppButton type="submit" variant="danger" block :disabled="rejectSubmitting">
          {{ rejectSubmitting ? 'Ուղարկվում է…' : 'Մերժել և ուղարկել պատճառը' }}
        </AppButton>
      </form>
    </AppModal>

    <AdminImageLightbox
      v-model="lightboxOpen"
      :images="lightboxImages"
      :start-index="lightboxIndex"
    />

    <DeactivateReasonDialog
      v-model="deactivateDialogOpen"
      :driver-name="deactivateTarget?.driverName"
      :submitting="deactivateSubmitting"
      :error="deactivateError"
      @confirm="confirmDeactivate"
    />
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

  &__header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  &__nav-link {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-primary);

    &:hover {
      text-decoration: underline;
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

  /**
   * The headline total, deliberately inside the <h2> rather than off at the
   * far right of a very wide header — "how many drivers do we have" should be
   * readable in the same glance as the word it counts.
   */
  &__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    margin-left: var(--space-2);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 700;
    /* Independent of the h2's line-height, so the pill stays a pill */
    line-height: 1.7;
    vertical-align: middle;
  }

  &__count-split {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.88rem;
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

.admin-hint {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  margin: 0 0 var(--space-3);
}

.password-picker {
  &__intro {
    margin: 0 0 var(--space-4);
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }

  &__all {
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-2);
  }

  &__list {
    list-style: none;
    margin: 0 0 var(--space-4);
    padding: 0;
    /* Scrolls inside the modal rather than growing it: the list is as long as
       the migration backlog, and the send button has to stay reachable without
       scrolling past every driver on the platform. */
    max-height: 45vh;
    overflow-y: auto;

    li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
  }

  &__phone {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  &__result {
    margin: var(--space-4) 0 0;
  }
}

.broadcast-picker {
  &__field {
    margin-bottom: var(--space-4);
  }

  &__textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    resize: vertical;
  }
}

/* The rejection reason. A bare <textarea> for the same reason the broadcast box
   above is one: AppInput is a single-line control, and the two places in this
   panel that need several lines do not justify a component between them. */
.reject-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);

  &__label {
    font-size: 0.9rem;
    font-weight: 600;
  }

  &__textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-family: inherit;
    color: var(--color-text);
    background: var(--color-surface);
    resize: vertical;
  }

  &__counter {
    margin: var(--space-1) 0 0;
    font-size: 0.78rem;
    color: var(--color-text-muted);
    text-align: right;

    &--over {
      color: var(--color-danger);
      font-weight: 600;
    }
  }
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

  &__badges {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-1);
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

  // Boxed off from the fields around it: unlike everything else in the card
  // this control publishes the truck to a page the moment it is ticked, and a
  // checkbox that sits flush with read-only rows is one an admin ticks by
  // accident on the way past.
  &__heavy {
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }

  &__hint {
    margin: 0;
    padding-left: 30px; // lines up under the checkbox label, not its box
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--color-text-secondary);
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

  &__primary-edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    max-width: 420px;
  }

  &__areas {
    margin-bottom: var(--space-4);
  }

  &__areas-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.78rem;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  &__areas-count {
    font-weight: 600;
    color: var(--color-text);
  }

  &__area-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__area {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 4px 4px 4px var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-bg);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  /* The one that is also the truck's citySlug/districtSlug. Marked because
     removing it is the case that re-points the placement, and an admin should
     be able to see that coming before the confirm dialog says so. */
  &__area--primary {
    border-color: var(--color-primary);
    font-weight: 600;
  }

  &__area-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--color-text-secondary);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--color-danger);
      color: #fff;
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
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

  /* Boxed so the status badge and the field read as one question ("does this
     driver have a marker, and what is it") rather than as a loose badge
     floating above an unrelated input. */
  &__coordinates {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }

  &__coordinates-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
  }
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

</style>
