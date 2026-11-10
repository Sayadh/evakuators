<script setup lang="ts">
/**
 * Who may use the driver app (ADMIN only — the API refuses DISPATCHER).
 *
 * Two kinds of app driver, never mixed:
 * - «Կայքի վարորդ» (SITE_LINKED): already on the website; an admin GRANTS
 *   access here. They sign into the app with their website phone + password.
 * - «Միայն հավելված» (APP_ONLY): registered in the app, not on the website;
 *   an admin APPROVES or REJECTS the request here. Never shown on the site.
 *
 * Taking access away logs every device out at once and is refused while the
 * driver holds an order (release the order first).
 *
 * The website listing and app access are INDEPENDENT: a driver taken off the
 * site keeps working in the app while access is ACTIVE, and suspending app
 * access never touches the website.
 */
import { computed, onMounted, ref } from 'vue'
import { VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'
import type { FleetDriver, FleetDriverKind, FleetDriverStatus, FleetSiteCandidate } from '~/types/opsDispatch'
import type { VehicleType } from '~/types/enums'
import { formatDateNumeric } from '~/utils/formatters'
import { apiErrorText } from '~/utils/opsDispatchLabels'

const adminAuth = useAdminAuthStore()

const STATUS_LABEL: Record<FleetDriverStatus, string> = {
  PENDING_REVIEW: 'Սպասում է ստուգման',
  ACTIVE: 'Ակտիվ',
  SUSPENDED: 'Կասեցված',
  REJECTED: 'Մերժված',
  DELETED: 'Վարորդը ջնջել է հաշիվը',
}
const KIND_LABEL: Record<FleetDriverKind, string> = {
  SITE_LINKED: 'Կայքի վարորդ',
  APP_ONLY: 'Միայն հավելված',
}

const pending = ref<FleetDriver[]>([])
const drivers = ref<FleetDriver[]>([])
const statusFilter = ref<FleetDriverStatus | ''>('')
const kindFilter = ref<FleetDriverKind | ''>('')
const search = ref('')
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busyId = ref<string | null>(null)

const siteQuery = ref('')
const siteResults = ref<FleetSiteCandidate[]>([])
const siteSearched = ref(false)

/** One open "reason" box at a time: reject / suspend need a reason */
const reasonFor = ref<{ id: number; action: 'reject' | 'suspend' } | null>(null)
const reasonText = ref('')
/** One open "link to website profile" box */
const linkFor = ref<number | null>(null)
const linkQuery = ref('')
const linkResults = ref<FleetSiteCandidate[]>([])

const vehicleLabel = (type: string) => VEHICLE_TYPE_LABELS[type as VehicleType] ?? type

function capacity(d: FleetDriver): string {
  const parts = [d.capacityTons !== null ? `${d.capacityTons} տ` : null, d.manipulator ? 'կռունկ' : null, d.wheelSkates ? 'անիվային ռոլիկներ' : null]
  return parts.filter(Boolean).join(' · ')
}

async function load() {
  error.value = null
  try {
    const [p, all] = await Promise.all([
      opsDispatchRepository.fleet({ status: 'PENDING_REVIEW' }),
      opsDispatchRepository.fleet({ status: statusFilter.value || undefined, kind: kindFilter.value || undefined, q: search.value.trim() }),
    ])
    pending.value = p
    drivers.value = all
  } catch (e) {
    error.value = apiErrorText(e, 'Ցուցակը բեռնել չհաջողվեց (միայն ադմինիստրատորի համար)։')
  }
}

async function run(key: string, action: () => Promise<FleetDriver>, done: (d: FleetDriver) => string) {
  error.value = null
  notice.value = null
  busyId.value = key
  try {
    notice.value = done(await action())
    reasonFor.value = null
    reasonText.value = ''
    linkFor.value = null
    await load()
    if (siteSearched.value) await searchSite()
  } catch (e) {
    error.value = apiErrorText(e, 'Գործողությունը չհաջողվեց։')
  } finally {
    busyId.value = null
  }
}

async function searchSite() {
  if (siteQuery.value.trim().length < 2) return
  try {
    siteResults.value = await opsDispatchRepository.siteCandidates(siteQuery.value)
    siteSearched.value = true
  } catch (e) {
    error.value = apiErrorText(e, 'Որոնումը չհաջողվեց։')
  }
}

async function searchLink() {
  if (linkQuery.value.trim().length < 2) return
  try {
    linkResults.value = (await opsDispatchRepository.siteCandidates(linkQuery.value)).filter((c) => c.driverId === null)
  } catch (e) {
    error.value = apiErrorText(e, 'Որոնումը չհաջողվեց։')
  }
}

const grant = (c: FleetSiteCandidate) =>
  run(`grant-${c.towTruckId}`, () => opsDispatchRepository.grantSiteAccess(c.towTruckId), (d) => `${d.driverName}-ին տրվեց հավելվածի հասանելիություն։ Մուտքը՝ կայքի գաղտնաբառով։`)
const approve = (d: FleetDriver) =>
  run(`approve-${d.id}`, () => opsDispatchRepository.fleetAction(d.id, 'approve'), (x) => `${x.driverName}-ի հայտը հաստատվեց։`)
/** Deleting is irreversible: the first click only arms the button for this driver */
const deleteArmed = ref<number | null>(null)
const deleteOnRequest = (d: FleetDriver) => {
  deleteArmed.value = null
  return run(`delete-${d.id}`, () => opsDispatchRepository.fleetAction(d.id, 'delete-account'), () => 'Հաշիվը ջնջվեց (անձնական տվյալներն ու տեղադրության պատմությունը)։')
}
const reactivate = (d: FleetDriver) =>
  run(`reactivate-${d.id}`, () => opsDispatchRepository.fleetAction(d.id, 'reactivate'), (x) => `${x.driverName}-ի հասանելիությունը վերականգնվեց։`)

function submitReason() {
  const target = reasonFor.value
  if (!target || reasonText.value.trim().length < 2) return
  const text = reasonText.value.trim()
  void run(
    `${target.action}-${target.id}`,
    () => opsDispatchRepository.fleetActionWithReason(target.id, target.action, text),
    (x) => (target.action === 'reject' ? `${x.driverName}-ի հայտը մերժվեց։` : `${x.driverName}-ի հասանելիությունը կասեցվեց, բոլոր սարքերից դուրս է բերվել։`),
  )
}

function link(driverId: number, c: FleetSiteCandidate) {
  void run(`link-${driverId}`, () => opsDispatchRepository.linkToSite(driverId, c.towTruckId), (x) => `${x.driverName}-ը կապվեց կայքի պրոֆիլին։ Մուտքն այսուհետ՝ կայքի գաղտնաբառով։`)
}

const empty = computed(() => drivers.value.length === 0)

onMounted(() => {
  adminAuth.init()
  void load()
})
useSeoMetaData({ title: 'Հավելվածի վարորդներ', description: 'Հավելվածի վարորդներ', path: '/admin/orders/drivers', noindex: true })
</script>

<template>
  <div class="container fleet">
    <NuxtLink to="/admin/orders">← Պատվերներ</NuxtLink>
    <h1>Հավելվածի վարորդներ</h1>
    <p class="muted">
      Կայքի վարորդը հավելված է մտնում կայքի նույն հեռախոսահամարով և գաղտնաբառով, բայց միայն այն բանից հետո, երբ այստեղ նրան
      հասանելիություն տաք։ Հավելվածում գրանցված վարորդները կայքում չեն երևում։ Կայքն ու հավելվածը իրարից անկախ են․ կայքում
      անջատվածը հավելվածով պատվերներ ստանում է, իսկ այստեղ կասեցնելը կայքի վրա չի ազդում։
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="ok" role="status">{{ notice }}</p>

    <section class="fleet__section">
      <h2>Նոր հայտեր <span class="count">{{ pending.length }}</span></h2>
      <p v-if="pending.length === 0" class="muted">Սպասող հայտեր չկան։</p>
      <article v-for="d in pending" :key="d.id" class="fleet__card">
        <div>
          <strong>{{ d.driverName }}</strong> · <a :href="`tel:${d.phone}`">{{ d.phone }}</a>
          <div class="muted">{{ vehicleLabel(d.vehicleType) }} · {{ capacity(d) }}<template v-if="d.vehicleDescription"> · {{ d.vehicleDescription }}</template></div>
          <div class="muted small">Հայտը՝ {{ formatDateNumeric(d.createdAt) }}. Հաստատելուց առաջ զանգահարեք և ստուգեք տվյալները։</div>
        </div>
        <div class="fleet__actions">
          <AppButton size="sm" :disabled="busyId !== null" @click="approve(d)">Հաստատել</AppButton>
          <AppButton size="sm" variant="outline" :disabled="busyId !== null" @click="reasonFor = { id: d.id, action: 'reject' }">Մերժել</AppButton>
        </div>
        <form v-if="reasonFor?.id === d.id && reasonFor.action === 'reject'" class="fleet__reason" @submit.prevent="submitReason">
          <input v-model="reasonText" placeholder="Մերժման պատճառը" maxlength="300" />
          <AppButton size="sm" type="submit" :disabled="reasonText.trim().length < 2">Մերժել</AppButton>
        </form>
      </article>
    </section>

    <section class="fleet__section">
      <h2>Տալ հասանելիություն կայքի վարորդին</h2>
      <form class="fleet__search" @submit.prevent="searchSite">
        <input v-model="siteQuery" placeholder="Անուն, հեռախոսահամար կամ slug" />
        <AppButton size="sm" type="submit">Որոնել</AppButton>
      </form>
      <p v-if="siteSearched && siteResults.length === 0" class="muted">Ոչինչ չգտնվեց։</p>
      <table v-if="siteResults.length" class="fleet__table">
        <tbody>
          <tr v-for="c in siteResults" :key="c.towTruckId">
            <td>
              <NuxtLink :to="`/tow-trucks/${c.slug}`" target="_blank">{{ c.driverName }}</NuxtLink>
              <span v-if="!c.isActive" class="tag tag--muted">կայքում անջատված (հասանելիություն տալ կարելի է)</span>
            </td>
            <td>{{ c.phone }}</td>
            <td>{{ vehicleLabel(c.vehicleType) }}</td>
            <td>
              <span v-if="c.accessStatus === 'ACTIVE'" class="tag tag--ok">Հասանելիություն կա</span>
              <AppButton v-else size="sm" :disabled="busyId !== null" @click="grant(c)">
                {{ c.accessStatus === 'SUSPENDED' ? 'Վերականգնել հասանելիությունը' : 'Տալ հասանելիություն' }}
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="fleet__section">
      <h2>Բոլոր վարորդները</h2>
      <form class="fleet__filters" @submit.prevent="load">
        <select v-model="statusFilter" @change="load">
          <option value="">Բոլոր վիճակները</option>
          <option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
        <select v-model="kindFilter" @change="load">
          <option value="">Երկու տեսակը</option>
          <option v-for="(label, key) in KIND_LABEL" :key="key" :value="key">{{ label }}</option>
        </select>
        <input v-model="search" placeholder="Անուն կամ հեռախոս" />
        <AppButton size="sm" type="submit">Գտնել</AppButton>
      </form>
      <p v-if="empty" class="muted">Վարորդներ չկան։</p>
      <table v-else class="fleet__table">
        <thead>
          <tr>
            <th>Վարորդ</th>
            <th>Տեսակ</th>
            <th>Մեքենա</th>
            <th>Վիճակ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="d in drivers" :key="d.id">
            <tr>
              <td>
                <NuxtLink v-if="d.slug" :to="`/tow-trucks/${d.slug}`" target="_blank">{{ d.driverName }}</NuxtLink>
                <template v-else>{{ d.driverName }}</template>
                <div class="muted small">{{ d.phone }}</div>
              </td>
              <td>
                <span class="tag" :class="d.kind === 'SITE_LINKED' ? 'tag--site' : 'tag--app'">{{ KIND_LABEL[d.kind] }}</span>
              </td>
              <td>{{ vehicleLabel(d.vehicleType) }}<div class="muted small">{{ capacity(d) }}</div></td>
              <td>
                {{ STATUS_LABEL[d.status] }}
                <div v-if="d.kind === 'SITE_LINKED' && !d.siteListed" class="muted small">կայքում անջատված է (հավելվածի վրա չի ազդում)</div>
                <div v-if="d.statusReason" class="muted small">{{ d.statusReason }}</div>
              </td>
              <td class="fleet__actions">
                <AppButton v-if="d.status === 'ACTIVE'" size="sm" variant="outline" :disabled="busyId !== null" @click="reasonFor = { id: d.id, action: 'suspend' }">Կասեցնել</AppButton>
                <AppButton v-if="d.status === 'SUSPENDED'" size="sm" :disabled="busyId !== null" @click="reactivate(d)">Վերականգնել</AppButton>
                <AppButton v-if="d.status === 'PENDING_REVIEW'" size="sm" :disabled="busyId !== null" @click="approve(d)">Հաստատել</AppButton>
                <AppButton v-if="d.kind === 'APP_ONLY' && d.status !== 'DELETED'" size="sm" variant="ghost" :disabled="busyId !== null" @click="linkFor = linkFor === d.id ? null : d.id">Կապել կայքի պրոֆիլին</AppButton>
                <template v-if="d.status !== 'DELETED'">
                  <AppButton
                    v-if="deleteArmed !== d.id"
                    size="sm"
                    variant="ghost"
                    :disabled="busyId !== null"
                    title="Վարորդի խնդրանքով (առանց հավելվածի). նախ համոզվեք, որ խնդրողը հենց նա է"
                    @click="deleteArmed = d.id"
                  >Ջնջել հաշիվը</AppButton>
                  <AppButton v-else size="sm" variant="danger" :disabled="busyId !== null" @click="deleteOnRequest(d)">Հաստատել ջնջումը</AppButton>
                </template>
              </td>
            </tr>
            <tr v-if="reasonFor?.id === d.id && reasonFor.action === 'suspend'">
              <td colspan="5">
                <form class="fleet__reason" @submit.prevent="submitReason">
                  <input v-model="reasonText" placeholder="Կասեցման պատճառը (վարորդը դուրս կբերվի բոլոր սարքերից)" maxlength="300" />
                  <AppButton size="sm" type="submit" :disabled="reasonText.trim().length < 2">Կասեցնել</AppButton>
                </form>
              </td>
            </tr>
            <tr v-if="linkFor === d.id">
              <td colspan="5">
                <p class="muted small">
                  Եթե այս վարորդն արդեն ունի կայքի պրոֆիլ, կապեք դրան․ պատվերների պատմությունը կպահպանվի, իսկ մուտքն այսուհետ կլինի կայքի
                  գաղտնաբառով։
                </p>
                <form class="fleet__search" @submit.prevent="searchLink">
                  <input v-model="linkQuery" placeholder="Կայքի վարորդի անուն կամ հեռախոս" />
                  <AppButton size="sm" type="submit">Որոնել</AppButton>
                </form>
                <ul class="fleet__links">
                  <li v-for="c in linkResults" :key="c.towTruckId">
                    {{ c.driverName }} · {{ c.phone }}
                    <AppButton size="sm" :disabled="busyId !== null" @click="link(d.id, c)">Կապել</AppButton>
                  </li>
                </ul>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped lang="scss">
.fleet {
  padding: var(--space-5) 0 var(--space-8);
  display: grid;
  gap: var(--space-4);
  &__section {
    display: grid;
    gap: var(--space-3);
  }
  &__card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: flex-start;
  }
  &__reason,
  &__search,
  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    grid-column: 1 / -1;
    input,
    select {
      flex: 1 1 200px;
      padding: 6px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
    }
  }
  &__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
    th,
    td {
      text-align: left;
      padding: 8px 6px;
      border-bottom: 1px solid var(--color-border);
      vertical-align: top;
    }
  }
  &__links {
    list-style: none;
    padding: 0;
    display: grid;
    gap: var(--space-2);
  }
}
.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.8rem;
  background: var(--color-surface-muted, #eef1f5);
  &--site {
    background: #e6efff;
  }
  &--app {
    background: #fff3dc;
  }
  &--ok {
    background: #e3f6ea;
  }
  &--muted {
    color: var(--color-text-muted);
  }
}
.count {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
.muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.82rem;
}
.error {
  color: var(--color-danger);
}
.ok {
  color: var(--color-success);
}
</style>
