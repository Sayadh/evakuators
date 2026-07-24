<script setup lang="ts">
import { SERVICE_CATEGORIES } from '~/constants/services'
import { SITE_NAME } from '~/constants/site'
import { myTowTruckRepository, type UpdateMyTowTruckPayload } from '~/repositories'
import { useDriverAuthStore } from '~/stores/driverAuth'
import type { ServiceType } from '~/types/enums'
import type { TowTruck } from '~/types/towTruck'

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

const form = reactive({
  secondaryPhone: '',
  whatsapp: '',
  telegram: '',
  email: '',
  description: '',
  services: [] as ServiceType[],
  priceCityCallout: '',
  pricePerKm: '',
  priceWaitingPerHour: '',
  priceNightSurchargePercent: '',
  priceExtraLoading: '',
})

const saving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)

function fillFormFromTruck(data: TowTruck): void {
  form.secondaryPhone = data.secondaryPhone ?? ''
  form.whatsapp = data.whatsapp ?? ''
  form.telegram = data.telegram ?? ''
  form.email = data.email ?? ''
  form.description = data.description
  form.services = [...data.services]
  form.priceCityCallout = data.pricing?.cityCallout?.toString() ?? ''
  form.pricePerKm = data.pricing?.perKm?.toString() ?? ''
  form.priceWaitingPerHour = data.pricing?.waitingPerHour?.toString() ?? ''
  form.priceNightSurchargePercent = data.pricing?.nightSurchargePercent?.toString() ?? ''
  form.priceExtraLoading = data.pricing?.extraLoading?.toString() ?? ''
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    truck.value = await myTowTruckRepository.getMine()
    fillFormFromTruck(truck.value)
  } catch {
    loadError.value = 'Պրոֆիլը բեռնել չհաջողվեց։ Կրկին մուտք գործեք։'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (driverAuth.isLoggedIn) void load()
})

function toOptionalInt(value: string): number | undefined {
  const trimmed = value.trim()
  return trimmed ? Number(trimmed) : undefined
}

async function submit(): Promise<void> {
  saving.value = true
  saveError.value = ''
  saveSuccess.value = false
  try {
    const payload: UpdateMyTowTruckPayload = {
      secondaryPhone: form.secondaryPhone.trim() || undefined,
      whatsapp: form.whatsapp.trim() || undefined,
      telegram: form.telegram.trim() || undefined,
      email: form.email.trim() || undefined,
      description: form.description.trim(),
      services: form.services,
      priceCityCallout: toOptionalInt(form.priceCityCallout),
      pricePerKm: toOptionalInt(form.pricePerKm),
      priceWaitingPerHour: toOptionalInt(form.priceWaitingPerHour),
      priceNightSurchargePercent: toOptionalInt(form.priceNightSurchargePercent),
      priceExtraLoading: toOptionalInt(form.priceExtraLoading),
    }
    truck.value = await myTowTruckRepository.updateMine(payload)
    fillFormFromTruck(truck.value)
    saveSuccess.value = true
  } catch {
    saveError.value = 'Պահպանել չհաջողվեց, ստուգիր դաշտերը։'
  } finally {
    saving.value = false
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

    <LoadingSkeleton v-if="loading" variant="text" :count="5" />

    <p v-else-if="loadError" class="dashboard-error">{{ loadError }}</p>

    <template v-else-if="truck">
      <p class="dashboard-hint">
        <strong>{{ truck.driverName }}</strong> · {{ truck.vehicle.brand }}
        {{ truck.vehicle.model }} · <NuxtLink :to="`/tow-trucks/${truck.slug}`">Տեսնել պրոֆիլը կայքում</NuxtLink>
      </p>

      <form class="dashboard-form" @submit.prevent="submit">
        <fieldset class="dashboard-section">
          <legend>Կոնտակտներ</legend>
          <AppInput v-model="form.secondaryPhone" type="tel" label="Լրացուցիչ հեռախոս" />
          <AppInput v-model="form.whatsapp" type="tel" label="WhatsApp" />
          <AppInput v-model="form.telegram" label="Telegram username" />
          <AppInput v-model="form.email" type="email" label="Email" />
        </fieldset>

        <fieldset class="dashboard-section">
          <legend>Նկարագրություն</legend>
          <AppInput v-model="form.description" label="Նկարագրություն" />
        </fieldset>

        <fieldset class="dashboard-section">
          <legend>Ծառայություններ</legend>
          <ServiceCategoryPicker v-model="form.services" :categories="SERVICE_CATEGORIES" mode="form" />
        </fieldset>

        <fieldset class="dashboard-section">
          <legend>Գներ (ոչ պարտադիր)</legend>
          <AppInput v-model="form.priceCityCallout" type="number" label="Քաղաքի ներսում (֏)" />
          <AppInput v-model="form.pricePerKm" type="number" label="1 կմ-ի գին (֏)" />
          <AppInput v-model="form.priceWaitingPerHour" type="number" label="Սպասում, ժամում (֏)" />
          <AppInput
            v-model="form.priceNightSurchargePercent"
            type="number"
            label="Գիշերային հավելավճար (%)"
          />
          <AppInput v-model="form.priceExtraLoading" type="number" label="Լրացուցիչ բարձում (֏)" />
        </fieldset>

        <p v-if="saveError" class="dashboard-error">{{ saveError }}</p>
        <p v-if="saveSuccess" class="dashboard-success">Հաջողությամբ պահպանվեց ✓</p>

        <AppButton type="submit" variant="success" block :disabled="saving">
          {{ saving ? 'Պահպանվում է…' : 'Պահպանել' }}
        </AppButton>
      </form>

      <section class="dashboard-section dashboard-section--routes">
        <h2>Ազատ երթուղիներ</h2>
        <p class="dashboard-hint">
          Մեկնում եք ինչ-որ ուղղությամբ դատարկ։ Հրապարակեք երթուղին, և հաճախորդները, ովքեր շարժվում
          են նույն ուղղությամբ, կկարողանան կապվել ձեզ հետ։
        </p>
        <FreeRoutesManager :vehicle-type="truck.vehicle.type" />
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.dashboard-page {
  padding-top: var(--space-6);
  padding-bottom: var(--space-8);
  max-width: 640px;
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
  gap: var(--space-6);
}

.dashboard-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);

  legend {
    font-weight: 600;
    padding: 0 var(--space-2);
  }
}

.dashboard-section--routes {
  margin-top: var(--space-6);

  h2 {
    margin: 0;
  }

  .dashboard-hint {
    margin-bottom: 0;
  }
}

.dashboard-error {
  color: var(--color-danger);
}

.dashboard-success {
  color: var(--color-success);
}
</style>
