<script setup lang="ts">
import { staticCities } from '~/data/cities'
import { staticDistricts } from '~/data/districts'
import { SERVICE_LABELS } from '~/constants/services'
import { SITE_NAME } from '~/constants/site'
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import {
  adminRepository,
  isApiEnabled,
  type AdminRegistrationRequest,
  type AdminReview,
  type ApproveRegistrationPayload,
} from '~/repositories'
import type { ServiceType, VehicleType } from '~/types/enums'

/**
 * Internal moderation panel — not linked from the public site and excluded
 * from the sitemap. There is no auth here yet (see README before going live).
 */
useSeoMetaData({
  title: `Ադմին վահանակ | ${SITE_NAME}`,
  description: 'Ներքին մոդերացիայի էջ',
  path: '/admin',
  noindex: true,
})

const apiEnabled = isApiEnabled()

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

const statusOptions = [
  { value: 'PENDING', label: 'Սպասող' },
  { value: 'APPROVED', label: 'Հաստատված' },
  { value: 'REJECTED', label: 'Մերժված' },
  { value: 'ALL', label: 'Բոլորը' },
]

const statusFilter = ref<StatusFilter>('PENDING')
const registrations = ref<AdminRegistrationRequest[]>([])
const reviews = ref<AdminReview[]>([])
const loadingRegistrations = ref(false)
const loadingReviews = ref(false)
const registrationsError = ref('')
const reviewsError = ref('')
/** Id of the row whose action button is currently in flight (disables just that button) */
const actioningId = ref<number | null>(null)

function cityOrDistrictLabel(slug: string): string {
  return (
    staticCities.find((city) => city.slug === slug)?.name ??
    staticDistricts.find((district) => district.slug === slug)?.name ??
    slug
  )
}

function serviceLabel(slug: string): string {
  return SERVICE_LABELS[slug as ServiceType] ?? slug
}

function vehicleTypeLabel(slug: string): string {
  return VEHICLE_TYPE_LABELS[slug as VehicleType] ?? slug
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

async function loadRegistrations(): Promise<void> {
  loadingRegistrations.value = true
  registrationsError.value = ''
  try {
    registrations.value = await adminRepository.listRegistrations(
      statusFilter.value === 'ALL' ? undefined : statusFilter.value,
    )
  } catch {
    registrationsError.value = 'Հայտերը բեռնել չհաջողվեց։'
  } finally {
    loadingRegistrations.value = false
  }
}

async function loadReviews(): Promise<void> {
  loadingReviews.value = true
  reviewsError.value = ''
  try {
    reviews.value = await adminRepository.listPendingReviews()
  } catch {
    reviewsError.value = 'Կարծիքները բեռնել չհաջողվեց։'
  } finally {
    loadingReviews.value = false
  }
}

onMounted(() => {
  if (!apiEnabled) return
  void loadRegistrations()
  void loadReviews()
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
  } catch {
    registrationsError.value = 'Մերժել չհաջողվեց։'
  } finally {
    actioningId.value = null
  }
}

/* ── Approve registration (modal form) ── */
const approveModalOpen = ref(false)
const approveTarget = ref<AdminRegistrationRequest | null>(null)
const approveForm = reactive({
  slug: '',
  capacityTons: '',
  locationName: '',
  baseLocationSlug: '',
  description: '',
})
const approveError = ref('')
const approveSubmitting = ref(false)
const telegramLinkModalOpen = ref(false)
const telegramLinkUrl = ref('')
const telegramLinkCopied = ref(false)

const baseLocationOptions = computed(() =>
  (approveTarget.value?.citySlugs ?? []).map((slug) => ({
    value: slug,
    label: cityOrDistrictLabel(slug),
  })),
)

function openApprove(request: AdminRegistrationRequest): void {
  approveTarget.value = request
  approveForm.slug = ''
  approveForm.capacityTons = ''
  approveForm.baseLocationSlug = request.citySlugs[0] ?? ''
  approveForm.locationName = approveForm.baseLocationSlug
    ? cityOrDistrictLabel(approveForm.baseLocationSlug)
    : ''
  approveForm.description = ''
  approveError.value = ''
  approveModalOpen.value = true
}

watch(
  () => approveForm.baseLocationSlug,
  (slug) => {
    if (slug) approveForm.locationName = cityOrDistrictLabel(slug)
  },
)

async function submitApprove(): Promise<void> {
  if (!approveTarget.value) return

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(approveForm.slug)) {
    approveError.value = 'Slug-ը պետք է լինի լատինատառ, kebab-case (օր.՝ ashot-tow-service)'
    return
  }
  const capacityTons = Number(approveForm.capacityTons)
  if (!capacityTons || capacityTons < 0.5) {
    approveError.value = 'Բեռնատարողությունը պետք է լինի 0.5 տոննայից ավելի'
    return
  }
  if (!approveForm.locationName.trim()) {
    approveError.value = 'Վայրի անվանումը պարտադիր է'
    return
  }

  const isYerevan = approveTarget.value.mainRegionSlug === 'yerevan'
  const payload: ApproveRegistrationPayload = {
    slug: approveForm.slug,
    capacityTons,
    locationName: approveForm.locationName.trim(),
    description: approveForm.description.trim() || undefined,
    ...(isYerevan
      ? { districtSlug: approveForm.baseLocationSlug || undefined }
      : { citySlug: approveForm.baseLocationSlug || undefined }),
  }

  approveSubmitting.value = true
  approveError.value = ''
  try {
    const result = await adminRepository.approveRegistration(approveTarget.value.id, payload)
    approveModalOpen.value = false
    await loadRegistrations()

    telegramLinkUrl.value = result.telegramLinkUrl
    telegramLinkCopied.value = false
    telegramLinkModalOpen.value = true
  } catch (error) {
    approveError.value =
      error instanceof Error ? error.message : 'Հաստատել չհաջողվեց, ստուգիր դաշտերը։'
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
  } catch {
    reviewsError.value = 'Հաստատել չհաջողվեց։'
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
  } catch {
    reviewsError.value = 'Ջնջել չհաջողվեց։'
  } finally {
    actioningId.value = null
  }
}
</script>

<template>
  <div class="container admin-page">
    <h1>Ադմին վահանակ</h1>

    <EmptyState
      v-if="!apiEnabled"
      title="Backend API-ն միացված չէ"
      description="NUXT_PUBLIC_API_BASE_URL փոփոխականը դատարկ է, ուստի կայքն աշխատում է mock տվյալներով։ Ադմին վահանակն իմաստ ունի միայն իրական backend-ի հետ։"
      icon="info"
    />

    <template v-else>
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
                <dt>Հիմնական տարածք</dt>
                <dd>
                  {{ request.mainRegionSlug === 'yerevan' ? 'Երևան' : request.mainRegionSlug }} —
                  {{ request.citySlugs.map(cityOrDistrictLabel).join(', ') }}
                </dd>
              </div>
              <div class="admin-card__grid-full">
                <dt>Ծառայություններ</dt>
                <dd>{{ request.services.map(serviceLabel).join(', ') }}</dd>
              </div>
            </dl>

            <div v-if="request.images.length" class="admin-card__images">
              <img
                v-for="image in request.images"
                :key="image.id"
                :src="image.url"
                loading="lazy"
                alt=""
              >
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
          v-model="approveForm.capacityTons"
          type="number"
          label="Բեռնատարողություն (տոննա)"
          placeholder="3.5"
          required
        />
        <AppSelect
          v-model="approveForm.baseLocationSlug"
          :options="baseLocationOptions"
          :label="approveTarget?.mainRegionSlug === 'yerevan' ? 'Թաղամաս' : 'Քաղաք'"
        />
        <AppInput v-model="approveForm.locationName" label="Վայրի անվանում (ցուցադրվող)" required />
        <AppInput v-model="approveForm.description" label="Նկարագրություն (ոչ պարտադիր)" />

        <p v-if="approveError" class="admin-error">{{ approveError }}</p>

        <AppButton type="submit" variant="success" block :disabled="approveSubmitting">
          {{ approveSubmitting ? 'Հաստատվում է…' : 'Հաստատել և ստեղծել պրոֆիլ' }}
        </AppButton>
      </form>
    </AppModal>

    <AppModal v-model="telegramLinkModalOpen" title="Պրոֆիլը ստեղծված է">
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
  </div>
</template>

<style scoped lang="scss">
.admin-page {
  padding-top: var(--space-6);
  padding-bottom: var(--space-8);

  h1 {
    margin-bottom: var(--space-5);
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

  &__images {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);

    img {
      width: 84px;
      height: 84px;
      object-fit: cover;
      border-radius: var(--radius-md);
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

  &__actions {
    display: flex;
    gap: var(--space-2);
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
</style>
