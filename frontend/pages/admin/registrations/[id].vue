<script setup lang="ts">
import { representativeCapacityTons } from '~/constants/vehicles'
import { SITE_NAME } from '~/constants/site'
import {
  adminRepository,
  isApiEnabled,
  type AdminRegistrationRequest,
  type ApproveRegistrationPayload,
} from '~/repositories'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { formatCoordinates, type Coordinates } from '~/utils/coordinates'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateNumeric } from '~/utils/formatters'
import { cityOrDistrictLabel } from '~/utils/geography'
import { composeLocationName, placementFor } from '~/utils/primaryArea'
import { baseCandidatesFor, buildServiceAreas } from '~/utils/serviceAreas'
import { buildRegistrationPayload } from '~/utils/registrationPayload'
import {
  createRegistrationFormState,
  numberFieldText,
  validateRegistrationForm,
} from '~/utils/registrationForm'

/**
 * Reviewing one registration request.
 *
 * ## What this page is
 *
 * The registration form, filled in with what the driver sent, editable, plus
 * the handful of things only the platform can decide (a latin slug, which of
 * the served areas the truck is BASED in, a description). Approving submits
 * the form — so **what the moderator sees is what gets published**.
 *
 * It replaced a four-field dialog on the request card in `/admin`. That dialog
 * asked for the slug, the base, the coordinates and a description, and copied
 * everything else off the stored request untouched, which meant a moderator who
 * noticed a misspelt surname or a phone with a digit missing had two options:
 * approve it wrong and repair it afterwards through half a dozen separate PATCH
 * endpoints, or reject a real driver and ask them to type the whole form again.
 *
 * ## Nothing is saved until Approve
 *
 * There is no draft. The stored `RegistrationRequest` keeps the driver's
 * original submission verbatim — it is the only surviving evidence of what was
 * actually sent — and approval writes the edits into the new `TowTruck`
 * instead. Leaving this page therefore discards the edits, which is the honest
 * behaviour: a half-corrected request is not a state anyone should be able to
 * observe. Rejecting discards them too, so a rejected request reads as what the
 * driver sent.
 *
 * ## Photos are read-only
 *
 * They are shown, at full size on click, and cannot be changed here. A
 * moderator reviewing a request neither uploads nor replaces photos, and an
 * upload widget on a page that cannot upload would be worse than none.
 */
useSeoMetaData({
  title: `Հայտի ստուգում | ${SITE_NAME}`,
  description: 'Ներքին մոդերացիայի էջ',
  path: '/admin',
  noindex: true,
})

const route = useRoute()
const router = useRouter()
const adminAuth = useAdminAuthStore()
const apiEnabled = isApiEnabled()

const requestId = computed(() => Number(route.params.id))

const request = ref<AdminRegistrationRequest | null>(null)
const loading = ref(true)
const loadError = ref('')

/**
 * The form, shared verbatim with `/register` — same state factory, same
 * validator, same component. See `utils/registrationForm.ts`.
 */
const form = reactive(createRegistrationFormState())
const errors = reactive<Record<string, string>>({})

/** The three answers registration cannot contain, so this page has to ask */
const adminForm = reactive({
  slug: '',
  /**
   * The base, as a chosen slug plus an optional village — not as free text.
   *
   * It used to be one `locationName` string an admin typed, which made the
   * label and the structural placement two independent facts: the text said
   * «Վարդենիս» while `citySlug` was whatever served area happened to come
   * first, and nothing tied them together. Now the slug IS the answer and the
   * label is composed from it, so a card cannot name a town the truck is not
   * filed under.
   */
  primarySlug: '',
  primarySettlement: '',
  description: '',
})

const submitting = ref(false)
const submitError = ref('')

/**
 * What the base picker may offer: the areas being published for this driver,
 * read live from the form rather than from the loaded request — a moderator who
 * removes a city must not still be able to base the truck there. Corridors are
 * dropped inside the picker.
 */
const baseCandidates = computed(() => baseCandidatesFor(form))

/**
 * Clears a base that the moderator has just removed from the coverage list.
 *
 * Without this the select keeps a slug that is no longer among its options, so
 * it renders blank while still holding a value — and `assertPlacementIsServed`
 * rejects the approval with a message about an area the moderator can no longer
 * see on screen.
 */
watch(
  baseCandidates,
  (candidates) => {
    if (
      adminForm.primarySlug &&
      !candidates.some((candidate) => candidate.slug === adminForm.primarySlug)
    ) {
      adminForm.primarySlug = ''
    }
  },
  { deep: true },
)

/* ── Load ── */

/** Fills the shared form from the stored request — every field, unchanged */
function fillForm(data: AdminRegistrationRequest): void {
  Object.assign(form, createRegistrationFormState(), {
    firstName: data.firstName,
    lastName: data.lastName,
    companyName: data.companyName ?? '',
    phone: data.phone,
    secondaryPhone: data.secondaryPhone ?? '',
    whatsapp: data.whatsapp ?? '',
    telegram: data.telegram ?? '',
    brand: data.vehicleBrand,
    model: data.vehicleModel ?? '',
    year: String(data.vehicleYear),
    vehicleType: data.vehicleType,
    capacity: data.capacityRange,
    // `numberFieldText`, not `String(...)`: an unanswered number arrives as
    // null or as 0, and both have to render as an empty box or the form
    // refuses to submit on a field nobody filled in. See the helper.
    platformLengthM: numberFieldText(data.platformLengthM),
    platformWidthM: numberFieldText(data.platformWidthM),
    craneCapacityTons: numberFieldText(data.craneCapacityTons),
    craneReachM: numberFieldText(data.craneReachM),
    maxLoadTons: numberFieldText(data.maxLoadTons),
    platformLoadHeightCm: numberFieldText(data.platformLoadHeightCm),
    winch: data.winch,
    manipulator: data.manipulator,
    wheelSkates: data.wheelSkates,
    // The driver's CLAIM to «Ծանր տեխնիկայի տեղափոխում», shown as a normal
    // ticked box the moderator may untick. That is the whole moderation step:
    // what leaves this page is what goes live, so an unticked box here means
    // the truck does not appear on /tsanr-tehnika. See the DTO.
    heavyEquipment: data.heavyEquipment ?? false,
    servesAllArmenia: data.servesAllArmenia ?? false,
    ...splitWorkingHours(data.workingHoursText),
    regionSlugs: [...data.regionSlugs],
    citySlugs: [...data.citySlugs],
    // Pre-filled when the driver answered, blank when they skipped it — and
    // blank is submitted as "no location", because the moderator can see the
    // empty box. See resolveApprovalCoordinates on the backend.
    coordinates: formatCoordinates(data.latitude, data.longitude),
    services: [...data.services],
    priceCityCallout: numberFieldText(data.priceCityCallout),
    pricePerKm: numberFieldText(data.pricePerKm),
    priceWaitingPerHour: numberFieldText(data.priceWaitingPerHour),
    priceNightSurchargePercent: numberFieldText(data.priceNightSurchargePercent),
    priceExtraLoading: numberFieldText(data.priceExtraLoading),
  })
}

/**
 * `"09:00 – 20:00"` back into the two `<input type="time">` values it was built
 * from. Anything that does not match that exact shape yields two empty fields
 * rather than a guess — the pair is optional, and a half-parsed range would
 * submit a working-hours string the API then rejects on a pattern the moderator
 * never typed.
 */
function splitWorkingHours(text?: string): { workingHoursStart: string; workingHoursEnd: string } {
  const match = text?.match(/^(\d{2}:\d{2})\s[–-]\s(\d{2}:\d{2})$/)
  return {
    workingHoursStart: match?.[1] ?? '',
    workingHoursEnd: match?.[2] ?? '',
  }
}

async function load(): Promise<void> {
  if (!apiEnabled || !adminAuth.isLoggedIn) {
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    const data = await adminRepository.getRegistration(requestId.value)
    request.value = data
    fillForm(data)
    // Deliberately NOT pre-filled from the driver's first area. That used to be
    // the suggestion, and because it was already filled in it was usually just
    // accepted — which made "the box the driver happened to tick first" decide
    // where the truck is based. It now decides ranking on that town's page too,
    // so an empty select that refuses to submit is the honest default: the one
    // person who knows the answer is asked for it.
    adminForm.primarySlug = ''
    adminForm.primarySettlement = ''
    adminForm.slug = ''
    adminForm.description = ''
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Հայտը բեռնել չհաջողվեց։')
  } finally {
    loading.value = false
  }
}

onMounted(load)
// The admin token is read from localStorage by a client plugin, which can land
// after this page mounts — so a first paint with no session is normal and a
// reload once it arrives is the fix, not an error state.
watch(() => adminAuth.isLoggedIn, (loggedIn) => {
  if (loggedIn && !request.value) void load()
})

const isPending = computed(() => request.value?.status === 'PENDING')

/* ── Lightbox ── */
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const lightboxImages = computed(() => request.value?.images.map((image) => image.url) ?? [])

function openLightbox(index: number): void {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

/* ── Approve ── */
const telegramLinkModalOpen = ref(false)
const telegramLinkUrl = ref('')
const telegramLinkCopied = ref(false)

const LINK_HINT_ONBOARDING =
  'Ուղարկիր այս link-ը վարորդին (Telegram/WhatsApp-ով) — մեկ սեղմումով նրա Telegram-ը ' +
  'կապակցվում է, և նույն պահին այնտեղ կստանա իր մուտքի գաղտնաբառը (եթե դեռ չունի իրենը)։ ' +
  'Link-ը վավեր է 7 օր։'

/**
 * Runs the shared rules plus this page's own two, and hands back the parsed
 * coordinate pair so the string in the box is read exactly once — the same
 * result that decided whether to show an error under the field is the one that
 * ends up in the payload.
 */
function validateAll(): { ok: boolean; coordinates: Coordinates | null } {
  const shared = validateRegistrationForm(form, errors)

  errors.slug = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(adminForm.slug)
    ? ''
    : 'Slug-ը պետք է լինի լատինատառ, kebab-case (օր.՝ ashot-tow-service)'
  errors.primarySlug = adminForm.primarySlug ? '' : 'Ընտրեք հիմնական քաղաքը կամ Երևանի շրջանը'

  return {
    ok: shared.ok && !errors.slug && !errors.primarySlug,
    coordinates: shared.coordinates,
  }
}

async function approve(): Promise<void> {
  if (!request.value) return

  submitError.value = ''
  const validation = validateAll()
  if (!validation.ok) {
    submitError.value = 'Ստուգիր նշված դաշտերը։'
    if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  // `imageIds` is dropped: the photos are already attached to this request and
  // approval re-points them at the new truck. Everything else is exactly the
  // payload the public form builds, which is the point — one builder, so a
  // field cannot be mapped one way for a driver and another way for an admin.
  const { imageIds: _imageIds, ...profile } = buildRegistrationPayload(
    form,
    [],
    validation.coordinates,
  )

  const placement = placementFor(adminForm.primarySlug)
  const primaryName = cityOrDistrictLabel(adminForm.primarySlug)

  const payload: ApproveRegistrationPayload = {
    ...profile,
    slug: adminForm.slug,
    capacityTons: representativeCapacityTons(form.capacity),
    // Composed, never typed: the backend has no geography and cannot rebuild
    // «Վարդենիս» from `vardenis`, so this string is stored exactly as sent.
    locationName: composeLocationName(primaryName, adminForm.primarySettlement),
    description: adminForm.description.trim() || undefined,
    ...placement,
    // Resolved to real Armenian names here — the backend has no geography data
    // of its own, so raw slugs would be stored as-is and a public profile would
    // show "ashtarak" instead of «Աշտարակ». Built from the same `citySlugs` the
    // payload carries, so the two cannot describe different sets.
    // Built by the shared helper, because the shape now depends on which
    // coverage question the driver was asked — cities for an ordinary
    // evacuator, marzes (or nothing plus the flag) for a specialist. The base
    // is appended there so `assertPlacementIsServed` still holds without being
    // relaxed. See utils/serviceAreas.ts.
    serviceAreas: buildServiceAreas({ ...form, baseSlug: adminForm.primarySlug }),
  }

  submitting.value = true
  try {
    const result = await adminRepository.approveRegistration(request.value.id, payload)
    telegramLinkUrl.value = result.telegramLinkUrl
    telegramLinkCopied.value = false
    telegramLinkModalOpen.value = true
  } catch (error) {
    submitError.value = extractErrorMessage(error, 'Հաստատել չհաջողվեց, ստուգիր դաշտերը։')
  } finally {
    submitting.value = false
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

function backToPanel(): void {
  void router.push('/admin')
}

/* ── Reject ── */
async function reject(): Promise<void> {
  if (!request.value) return
  if (!confirm(`Մերժե՞լ ${request.value.firstName} ${request.value.lastName}-ի հայտը։`)) return

  submitError.value = ''
  submitting.value = true
  try {
    await adminRepository.rejectRegistration(request.value.id)
    backToPanel()
  } catch (error) {
    submitError.value = extractErrorMessage(error, 'Մերժել չհաջողվեց։')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="container review">
    <NuxtLink to="/admin" class="review__back">← Ադմին վահանակ</NuxtLink>

    <EmptyState
      v-if="!apiEnabled"
      title="Backend API-ն միացված չէ"
      description="NUXT_PUBLIC_API_BASE_URL փոփոխականը դատարկ է, ուստի կայքն աշխատում է mock տվյալներով։"
      icon="info"
    />

    <EmptyState
      v-else-if="!adminAuth.isLoggedIn"
      title="Մուտք գործեք"
      description="Այս էջը հասանելի է միայն ադմինիստրատորին։ Բացեք ադմին վահանակը և մուտք գործեք։"
      icon="info"
    />

    <LoadingSkeleton v-else-if="loading" variant="text" :count="6" />

    <p v-else-if="loadError" class="review__error" role="alert">{{ loadError }}</p>

    <template v-else-if="request">
      <header class="review__header">
        <div>
          <h1>{{ request.firstName }} {{ request.lastName }}</h1>
          <p class="review__meta">
            Հայտ #{{ request.id }} · {{ formatDateNumeric(request.createdAt) }}
          </p>
        </div>
        <AppBadge :variant="isPending ? 'accent' : 'neutral'">
          {{ isPending ? 'Սպասում է' : request.status === 'APPROVED' ? 'Հաստատված' : 'Մերժված' }}
        </AppBadge>
      </header>

      <!-- Stated up front rather than discovered on submit: everything below is
           editable, and none of it is stored until Approve. -->
      <p class="review__intro">
        Ստորև վարորդի ուղարկած տվյալներն են։ Ուղղեք այն, ինչ պետք է, և սեղմեք «Հաստատել» —
        պրոֆիլը կստեղծվի <strong>հենց այս տեսքով</strong>։ Փոփոխությունները չեն պահվում մինչև
        հաստատումը։
      </p>

      <p v-if="!isPending" class="review__closed" role="status">
        Այս հայտն արդեն մշակված է, ուստի կարող եք միայն դիտել այն։
      </p>

      <form class="review__form" novalidate @submit.prevent="approve">
        <!-- Photos first, and read-only: they are the fastest way to tell a
             real request from a junk one, and there is nothing to edit. -->
        <fieldset v-if="request.images.length" class="review__section">
          <legend class="review__legend">Նկարներ</legend>
          <div class="review__images">
            <button
              v-for="(image, index) in request.images"
              :key="image.id"
              type="button"
              class="review__image-btn"
              aria-label="Մեծացնել նկարը"
              @click="openLightbox(index)"
            >
              <img :src="image.url" loading="lazy" alt="">
            </button>
          </div>
          <p class="review__hint">
            Առաջինը գլխավոր նկարն է։ Նկարները խմբագրելի չեն — դրանք վարորդն է ուղարկել։
          </p>
        </fieldset>

        <!-- Exactly the questions /register asks, in the same order, from the
             same component. See RegistrationFormFields for why. -->
        <RegistrationFormFields
          v-model="form"
          :errors="errors"
          :show-coordinate-guidance="false"
        />

        <!-- The three answers a registration cannot contain -->
        <fieldset class="review__section">
          <legend class="review__legend">Հարթակի տվյալներ</legend>
          <p class="review__hint">
            Այս դաշտերը վարորդը չի լրացնում — դրանք հարթակի որոշումն են։
          </p>

          <AppInput
            v-model="adminForm.slug"
            label="Slug (latin, kebab-case)"
            placeholder="ashot-tow-service"
            required
            :error="errors.slug"
          />

          <!-- Only the areas being published for this driver are offered — a
               base they do not serve would rank them first on that town's page
               while being the one driver who never agreed to go there. -->
          <div class="review__base">
            <PrimaryAreaPicker
              v-model:slug="adminForm.primarySlug"
              v-model:settlement="adminForm.primarySettlement"
              :candidates="baseCandidates"
            />
            <p v-if="errors.primarySlug" class="review__field-error" role="alert">
              {{ errors.primarySlug }}
            </p>
          </div>

          <AppInput
            v-model="adminForm.description"
            label="Նկարագրություն (ոչ պարտադիր)"
          />
        </fieldset>

        <p v-if="submitError" class="review__error" role="alert">{{ submitError }}</p>

        <div v-if="isPending" class="review__actions">
          <AppButton type="submit" variant="success" size="lg" :disabled="submitting">
            {{ submitting ? 'Հաստատվում է…' : 'Հաստատել և ստեղծել պրոֆիլ' }}
          </AppButton>
          <AppButton variant="outline" size="lg" type="button" :disabled="submitting" @click="reject">
            Մերժել հայտը
          </AppButton>
        </div>
      </form>
    </template>

    <AdminImageLightbox v-model="lightboxOpen" :images="lightboxImages" :start-index="lightboxIndex" />

    <!-- Shown here rather than back on the panel: the link is the only copy of
         a 7-day credential, and navigating away before an admin has copied it
         would mean regenerating it from the truck list to get another. -->
    <AppModal v-model="telegramLinkModalOpen" title="Պրոֆիլը ստեղծված է">
      <p class="review__hint">{{ LINK_HINT_ONBOARDING }}</p>
      <p class="review__link">{{ telegramLinkUrl }}</p>
      <AppButton variant="outline" block @click="copyTelegramLink">
        {{ telegramLinkCopied ? 'Պատճենված է ✓' : 'Պատճենել link-ը' }}
      </AppButton>
      <AppButton variant="primary" block @click="backToPanel">Վերադառնալ վահանակ</AppButton>
    </AppModal>
  </div>
</template>

<style scoped lang="scss">
.review {
  padding-bottom: var(--space-7);
  max-width: 860px;

  &__back {
    display: inline-block;
    margin-bottom: var(--space-4);
    font-size: 0.9rem;
    color: var(--color-text-secondary);

    &:hover {
      color: var(--color-primary);
    }
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);

    h1 {
      margin: 0;
    }
  }

  &__meta {
    margin: var(--space-1) 0 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  &__intro {
    color: var(--color-text-secondary);
    max-width: 640px;
  }

  &__closed {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-text-secondary);
    font-size: 0.9rem;
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
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  &__legend {
    font-size: 1.15rem;
    font-weight: 700;
    padding: 0;
    margin-bottom: var(--space-4);
  }

  &__hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }

  &__images {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  &__image-btn {
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
    line-height: 0;

    img {
      width: 108px;
      height: 108px;
      object-fit: cover;
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
    }
  }

  &__base {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  &__field-error,
  &__error {
    color: var(--color-danger);
    font-size: 0.9rem;
    margin: 0;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  &__link {
    word-break: break-all;
    font-family: monospace;
    font-size: 0.85rem;
    background: var(--color-bg);
    padding: var(--space-3);
    border-radius: var(--radius-md);
  }
}
</style>
