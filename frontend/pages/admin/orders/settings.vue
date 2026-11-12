<script setup lang="ts">
/**
 * Dispatch settings. Anyone with console access can READ them; only ADMIN can
 * save (the API returns 403 for DISPATCHER). Every value is range-checked by
 * the server, individually and as a combination, before anything is stored.
 */
import { onMounted, ref } from 'vue'
import { opsDispatchRepository } from '~/repositories/opsDispatch.repository'
import { useAdminAuthStore } from '~/stores/adminAuth'
import { apiErrorText } from '~/utils/opsDispatchLabels'

const adminAuth = useAdminAuthStore()
const values = ref<Record<string, number | number[]>>({})
const draft = ref<Record<string, string>>({})
const error = ref<string | null>(null)
const saved = ref(false)
const health = ref<Awaited<ReturnType<typeof opsDispatchRepository.health>> | null>(null)

const LABELS: Record<string, string> = {
  gpsMaxAgeSeconds: 'GPS-ի թարմություն (վ)',
  gpsMaxAccuracyMeters: 'GPS-ի առավելագույն սխալ բաշխման համար (մ)',
  heartbeatMaxAgeSeconds: 'Heartbeat-ի թարմություն (վ)',
  baseHeartbeatMaxAgeSeconds: 'Կայանատեղիով բաշխում՝ GPS-ն անջատած վարորդին կապի առավելագույն ընդմիջում (վ)',
  offerTimeoutSeconds: 'Պատասխանի ժամկետ՝ վարորդին հասնելու պահից (վ)',
  offerDeliverySeconds: 'Առաջարկի առաքման ժամկետ՝ եթե չի հասնում վարորդին (վ)',
  searchAlertSeconds: 'Օպերատորի ազդանշան որոնման ընթացքում (վ)',
  searchMaxSeconds: 'Որոնման առավելագույն տևողություն (վ)',
  maxOffersPerAttempt: 'Առավելագույն առաջարկներ մեկ որոնման մեջ',
  candidateBatchSize: 'Թեկնածուների խումբ',
  candidateRouteMaxAgeSeconds: 'Ճանապարհային տվյալների վերօգտագործում (վ)',
  etaTieSeconds: 'ETA-ների «հավասարություն» (վ)',
  yerevanRadiiMeters: 'Երևանի շառավիղներ (մ, ստորակետով)',
  regionRadiiMeters: 'Մարզերի շառավիղներ (մ, ստորակետով)',
  notMovingAlertSeconds: '«Շարժվում եմ» չսեղմելու ազդանշան (վ)',
  activeGpsLostAlertSeconds: 'Ակտիվ պատվերի GPS-ի կորստի ազդանշան (վ)',
  locationHistoryRetentionDays: 'Տեղադրության պատմության պահպանում (օր)',
  routingDailyElementBudget: 'Routing-ի օրական element-ների բյուջե',
  walletBillingEnabled: 'Վարորդի հաշվից միջնորդավճար (1 = միացված, 0 = անջատված)',
  walletFeeFreeMaxPriceAmd: 'Անվճար պատվեր՝ մինչև այս գինը ներառյալ (֏, 0 = չկա)',
  walletFeeBaseAmd: 'Միջնորդավճար՝ հիմնական (֏)',
  walletFeeBaseMaxPriceAmd: 'Հիմնական միջնորդավճարը՝ մինչև այս գինը (֏)',
  walletFeePercent: 'Դրանից վեր՝ ամբողջ գնի այսքան տոկոս (%)',
  walletFeeRoundAmd: '… կլորացված այսքան դրամով (֏, օր.՝ 100)',
  walletFeeMaxAmd: 'Միջնորդավճար՝ առավելագույնը (֏, 0 = առանց սահմանի)',
  walletMinTopupAmd: 'Հաշվի համալրում՝ նվազագույնը (֏)',
  walletMaxTopupAmd: 'Հաշվի համալրում՝ առավելագույնը (֏)',
  walletFreeMaxRouteMeters: 'Նվազագույն գինը չի թույլատրվում այս հեռավորությունից երկար պատվերի համար (մ, 0 = չկա)',
  walletTopupBonusEnabled: 'Համալրման բոնուս (1 = միացված, 0 = անջատված)',
  walletTopupBonusThresholdsAmd: 'Բոնուսի շեմեր (֏, ստորակետով)',
  walletTopupBonusPercents: 'Բոնուսի տոկոսներ (նույն հերթականությամբ, ստորակետով)',
  walletLowBalanceOrders: '«Մնացորդը քիչ է» ծանուցում, երբ մնացել է այսքան պատվերի միջնորդավճար',
}

async function load() {
  try {
    values.value = await opsDispatchRepository.settings()
    draft.value = Object.fromEntries(Object.entries(values.value).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]))
    health.value = await opsDispatchRepository.health()
  } catch (e) {
    error.value = apiErrorText(e, 'Կարգավորումները բեռնել չհաջողվեց։')
  }
}

async function save() {
  error.value = null
  saved.value = false
  const changes: Record<string, unknown> = {}
  for (const [key, text] of Object.entries(draft.value)) {
    const original = values.value[key]
    const parsed = Array.isArray(original) ? text.split(',').map((s) => Number(s.trim())) : Number(text)
    if (JSON.stringify(parsed) !== JSON.stringify(original)) changes[key] = parsed
  }
  if (Object.keys(changes).length === 0) return
  try {
    values.value = await opsDispatchRepository.updateSettings(changes)
    saved.value = true
  } catch (e) {
    error.value = apiErrorText(e, 'Պահպանել չհաջողվեց (միայն ադմինիստրատորը կարող է փոխել)։')
  }
}

onMounted(() => {
  adminAuth.init()
  void load()
})
useSeoMetaData({ title: 'Բաշխման կարգավորումներ', description: 'Բաշխման կարգավորումներ', path: '/admin/orders/settings', noindex: true })
</script>

<template>
  <div class="container settings">
    <OpsNav />
    <h1>Բաշխման կարգավորումներ</h1>
    <p v-if="health" class="muted">
      Ավտոմատ բաշխում՝ {{ health.flags.dispatch ? 'միացված' : 'անջատված' }} · Tracking՝ {{ health.flags.tracking ? 'միացված' : 'անջատված' }} ·
      Outbox՝ {{ health.outbox.backlog }} հերթում, {{ health.outbox.deadLetters }} ձախողված
    </p>
    <form class="settings__form" @submit.prevent="save">
      <label v-for="(label, key) in LABELS" :key="key">
        {{ label }}
        <input v-model="draft[key]" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="saved" class="ok" role="status">Պահպանվեց։</p>
      <AppButton type="submit">Պահպանել</AppButton>
    </form>
  </div>
</template>

<style scoped lang="scss">
.settings {
  padding: var(--space-5) 0 var(--space-8);
  max-width: 720px;
  &__form {
    display: grid;
    gap: var(--space-3);
    label {
      display: grid;
      gap: 4px;
      font-size: 0.9rem;
    }
    input {
      padding: 6px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
    }
  }
}
.muted {
  color: var(--color-text-muted);
}
.error {
  color: var(--color-danger);
}
.ok {
  color: var(--color-success);
}
</style>
