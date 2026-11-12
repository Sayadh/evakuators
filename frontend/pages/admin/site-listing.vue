<script setup lang="ts">
/**
 * «Ուզում եմ լինել նաև կայքում» — app drivers asking to be published (2026-11-12).
 *
 * A driver who signed up in the app works in the app only; their profile
 * exists (photos, prices, password) but is hidden from evakuators.am. From the
 * app's profile they file a request; here an admin reads the whole profile,
 * calls the driver if needed, and publishes it or refuses with a reason the
 * driver sees in the app. Something to correct? The driver edits it in the app
 * (moderated as usual) — or reject with what to fix.
 */
import { SITE_NAME } from '~/constants/site'
import { SERVICE_LABELS } from '~/constants/services'
import { vehicleTypeLabel } from '~/constants/vehicles'
import { adminRepository, isApiEnabled } from '~/repositories'
import type { AdminSiteListingDetail, AdminSiteListingRequest, SiteListingStatus } from '~/repositories/admin.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { extractErrorMessage } from '~/utils/errors'
import { formatDateNumeric } from '~/utils/formatters'
import { formatPrice } from '~/utils/formatPrice'

useSeoMetaData({ title: `Կայքում հրապարակման հայտեր | ${SITE_NAME}`, description: 'Ներքին մոդերացիայի էջ', path: '/admin', noindex: true })

const apiEnabled = isApiEnabled()
const adminAuth = useAdminAuthStore()

const filter = ref<SiteListingStatus | 'ALL'>('PENDING')
const requests = ref<AdminSiteListingRequest[]>([])
const loading = ref(true)
const loadError = ref('')
const openId = ref<number | null>(null)
const detail = ref<AdminSiteListingDetail | null>(null)
const detailLoading = ref(false)
const busy = ref(false)
const actionError = ref('')
const rejecting = ref(false)
const reason = ref('')

const STATUS_LABELS: Record<SiteListingStatus, string> = { PENDING: 'Սպասում է', APPROVED: 'Հաստատված', REJECTED: 'Մերժված' }

async function load(): Promise<void> {
  if (!apiEnabled || !adminAuth.isLoggedIn) {
    loading.value = false
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    requests.value = await adminRepository.listSiteListingRequests(filter.value)
  } catch (error) {
    loadError.value = extractErrorMessage(error, 'Հայտերը չհաջողվեց բեռնել')
  } finally {
    loading.value = false
  }
}

async function toggle(request: AdminSiteListingRequest): Promise<void> {
  actionError.value = ''
  rejecting.value = false
  reason.value = ''
  if (openId.value === request.id) {
    openId.value = null
    detail.value = null
    return
  }
  openId.value = request.id
  detail.value = null
  detailLoading.value = true
  try {
    detail.value = await adminRepository.getSiteListingRequest(request.id)
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Պրոֆիլը չհաջողվեց բեռնել')
  } finally {
    detailLoading.value = false
  }
}

async function approve(): Promise<void> {
  if (!detail.value) return
  if (!(await confirmDialog({ message: `Հրապարակե՞լ ${detail.value.profile.driverName}-ի էջը կայքում։`, confirmLabel: 'Հրապարակել' }))) return
  busy.value = true
  actionError.value = ''
  try {
    await adminRepository.approveSiteListing(detail.value.id)
    openId.value = null
    detail.value = null
    await load()
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Հաստատել չհաջողվեց')
  } finally {
    busy.value = false
  }
}

async function reject(): Promise<void> {
  if (!detail.value || reason.value.trim().length < 2) return
  busy.value = true
  actionError.value = ''
  try {
    await adminRepository.rejectSiteListing(detail.value.id, reason.value.trim())
    openId.value = null
    detail.value = null
    await load()
  } catch (error) {
    actionError.value = extractErrorMessage(error, 'Մերժել չհաջողվեց')
  } finally {
    busy.value = false
  }
}

function price(value?: number, suffix = ''): string {
  return value === undefined || value === null ? '—' : `${formatPrice(value)}${suffix}`
}

watch(filter, () => void load())
onMounted(() => void load())
</script>

<template>
  <div class="container listing">
    <NuxtLink to="/admin" class="listing__back">← Ադմին վահանակ</NuxtLink>

    <EmptyState v-if="!apiEnabled" title="Backend API-ն միացված չէ" description="NUXT_PUBLIC_API_BASE_URL փոփոխականը դատարկ է։" icon="info" />
    <EmptyState v-else-if="!adminAuth.isLoggedIn" title="Մուտք գործեք" description="Այս էջը հասանելի է միայն ադմինիստրատորին։" icon="info" />

    <template v-else>
      <header class="listing__header">
        <div>
          <h1>Կայքում հրապարակման հայտեր</h1>
          <p class="muted">Հավելվածի վարորդներ, որոնք ցանկանում են լինել նաև evakuators.am-ում։ Ստուգեք տվյալները, անհրաժեշտության դեպքում զանգահարեք, և հաստատեք կամ մերժեք՝ նշելով պատճառը։</p>
        </div>
        <select v-model="filter" class="listing__filter" aria-label="Կարգավիճակ">
          <option value="PENDING">Սպասող</option>
          <option value="APPROVED">Հաստատված</option>
          <option value="REJECTED">Մերժված</option>
          <option value="ALL">Բոլորը</option>
        </select>
      </header>

      <LoadingSkeleton v-if="loading" variant="text" :count="4" />
      <p v-else-if="loadError" class="listing__error" role="alert">{{ loadError }}</p>
      <p v-else-if="requests.length === 0" class="muted">Հայտեր չկան։</p>

      <article v-for="r in requests" v-else :key="r.id" class="listing__card" :class="{ 'listing__card--open': openId === r.id }">
        <button type="button" class="listing__row" @click="toggle(r)">
          <img v-if="r.towTruck.images[0]" :src="r.towTruck.images[0]" alt="" class="listing__thumb" />
          <span v-else class="listing__thumb listing__thumb--empty">🚚</span>
          <span class="listing__who">
            <strong>{{ r.towTruck.driverName }}</strong>
            <span class="muted">{{ vehicleTypeLabel(r.towTruck.vehicleType) }} · {{ r.towTruck.phone }}</span>
            <span class="muted small">Հայտը՝ {{ formatDateNumeric(r.createdAt) }}</span>
          </span>
          <span class="listing__status" :class="`listing__status--${r.status.toLowerCase()}`">{{ STATUS_LABELS[r.status] }}</span>
        </button>

        <div v-if="openId === r.id" class="listing__detail">
          <LoadingSkeleton v-if="detailLoading" variant="text" :count="5" />
          <template v-else-if="detail">
            <p v-if="detail.note" class="listing__note"><strong>Վարորդի մեկնաբանությունը՝</strong> {{ detail.note }}</p>
            <p v-if="detail.isActive && detail.status === 'PENDING'" class="listing__warn">Այս էջն արդեն կայքում է (ակտիվացվել է այլ կերպ)։ Հաստատումը միայն կփակի հայտը։</p>

            <div v-if="detail.profile.images.length" class="listing__photos">
              <a v-for="url in detail.profile.images" :key="url" :href="url" target="_blank" rel="noopener"><img :src="url" alt="" /></a>
            </div>

            <dl class="listing__facts">
              <dt>Անուն</dt><dd>{{ detail.profile.driverName }}<template v-if="detail.profile.companyName"> · {{ detail.profile.companyName }}</template></dd>
              <dt>Հեռախոս</dt>
              <dd>
                <a :href="`tel:${detail.profile.phone}`">{{ detail.profile.phone }}</a>
                <template v-if="detail.profile.secondaryPhone"> · <a :href="`tel:${detail.profile.secondaryPhone}`">{{ detail.profile.secondaryPhone }}</a></template>
              </dd>
              <dt v-if="detail.profile.whatsapp">WhatsApp</dt><dd v-if="detail.profile.whatsapp">{{ detail.profile.whatsapp }}</dd>
              <dt v-if="detail.profile.telegram">Telegram</dt><dd v-if="detail.profile.telegram">{{ detail.profile.telegram }}</dd>
              <dt>Մեքենա</dt>
              <dd>
                {{ vehicleTypeLabel(detail.profile.vehicle.type) }} · {{ detail.profile.vehicle.brand }} {{ detail.profile.vehicle.model }}
                <template v-if="detail.profile.vehicle.year"> ({{ detail.profile.vehicle.year }})</template>
                · {{ detail.profile.vehicle.capacityTons }} տ
              </dd>
              <dt>Ծառայություններ</dt>
              <dd>{{ detail.profile.services.map((s) => SERVICE_LABELS[s] ?? s).join(', ') || '—' }}</dd>
              <dt>Տարածքներ</dt>
              <dd>{{ detail.profile.servesAllArmenia ? 'Ամբողջ Հայաստան' : detail.profile.serviceAreas.map((a) => a.name).join(', ') || '—' }}</dd>
              <dt>Ժամեր</dt><dd>{{ detail.profile.works24Hours ? '24/7' : detail.profile.workingHours || '—' }}</dd>
              <dt>Կայանատեղի</dt>
              <dd>
                {{ detail.profile.location.name || '—' }}
                <template v-if="detail.profile.location.latitude"> · {{ detail.profile.location.latitude }}, {{ detail.profile.location.longitude }}</template>
              </dd>
              <dt>Գներ</dt>
              <dd>
                Քաղաքում՝ {{ price(detail.profile.pricing?.cityCallout) }} · 1 կմ՝ {{ price(detail.profile.pricing?.perKm) }} ·
                Սպասում՝ {{ price(detail.profile.pricing?.waitingPerHour, '/ժ') }}
              </dd>
              <dt>Նկարագրություն</dt><dd class="listing__desc">{{ detail.profile.description || '—' }}</dd>
            </dl>

            <p v-if="detail.status === 'REJECTED'" class="listing__warn">Մերժման պատճառը՝ {{ detail.rejectionReason }}</p>
            <p v-if="actionError" class="listing__error" role="alert">{{ actionError }}</p>

            <div v-if="detail.status === 'PENDING'" class="listing__actions">
              <AppButton :disabled="busy" @click="approve">Հաստատել և հրապարակել</AppButton>
              <AppButton variant="outline" :disabled="busy" @click="rejecting = !rejecting">Մերժել</AppButton>
              <a :href="`tel:${detail.profile.phone}`" class="listing__call">📞 Զանգահարել</a>
            </div>
            <form v-if="rejecting" class="listing__reject" @submit.prevent="reject">
              <input v-model="reason" maxlength="500" placeholder="Պատճառը (վարորդը կտեսնի հավելվածում)․ օրինակ՝ «Ավելացրեք մեքենայի պարզ նկար»" />
              <AppButton type="submit" variant="outline" :disabled="busy || reason.trim().length < 2">Ուղարկել մերժումը</AppButton>
            </form>
          </template>
          <p v-else-if="actionError" class="listing__error" role="alert">{{ actionError }}</p>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped lang="scss">
.listing {
  max-width: 960px;
  padding-bottom: var(--space-7);
  display: grid;
  gap: var(--space-4);

  &__back { color: var(--color-text-secondary, inherit); text-decoration: none; }
  &__header { display: flex; gap: var(--space-4); justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
  &__filter { padding: var(--space-2) var(--space-3); border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border, #e3e8ef); }
  &__error { color: var(--color-danger, #d64545); }
  &__warn { color: var(--color-warning, #a86a00); }

  &__card {
    border: 1px solid var(--color-border, #e3e8ef);
    border-radius: var(--radius-lg, 16px);
    background: var(--color-surface, #fff);
    overflow: hidden;

    &--open { box-shadow: var(--shadow-md, 0 2px 8px rgba(16, 30, 46, 0.08)); }
  }

  &__row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: none;
    border: 0;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  &__thumb {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-md, 8px);
    object-fit: cover;
    flex-shrink: 0;

    &--empty { display: grid; place-items: center; background: var(--color-bg, #f4f6f9); font-size: 24px; }
  }

  &__who { display: grid; gap: 2px; flex: 1; min-width: 0; }

  &__status {
    font-size: 0.85rem;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--color-bg, #f4f6f9);

    &--pending { background: #fff4de; color: #dd920f; }
    &--approved { background: #e6f7ed; color: #1d9e55; }
    &--rejected { background: #fdecec; color: #d64545; }
  }

  &__detail { padding: 0 var(--space-4) var(--space-4); display: grid; gap: var(--space-3); }
  &__note { background: var(--color-bg, #f4f6f9); padding: var(--space-3); border-radius: var(--radius-md, 8px); }

  &__photos {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-2);

    img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--radius-md, 8px); }
  }

  &__facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;

    dt { color: var(--color-text-secondary, #51617a); }
    dd { margin: 0; }
  }

  &__desc { white-space: pre-wrap; }
  &__actions { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
  &__call { text-decoration: none; }
  &__reject {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;

    input { flex: 1; min-width: 240px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md, 8px); border: 1px solid var(--color-border, #e3e8ef); }
  }
}

.muted { color: var(--color-text-secondary, #51617a); }
.small { font-size: 0.85rem; }
</style>
