<script setup lang="ts">
import type { TowTruckVehicle } from '~/types/towTruck'
import { VEHICLE_TYPE_DESCRIPTIONS, VEHICLE_TYPE_LABELS } from '~/constants/vehicles'
import { formatCapacity } from '~/utils/formatters'

interface Props {
  vehicle: TowTruckVehicle
}

const props = defineProps<Props>()

interface InfoRow {
  label: string
  value: string
  hint?: string
}

const rows = computed<InfoRow[]>(() => {
  const { vehicle } = props
  const result: InfoRow[] = [
    { label: 'Մակնիշ', value: vehicle.brand },
    { label: 'Մոդել', value: vehicle.model },
    { label: 'Տարեթիվ', value: String(vehicle.year) },
    {
      label: 'Տեսակ',
      value: VEHICLE_TYPE_LABELS[vehicle.type],
      hint: VEHICLE_TYPE_DESCRIPTIONS[vehicle.type],
    },
    { label: 'Բեռնատարողություն', value: `մինչև ${formatCapacity(vehicle.capacityTons)}` },
  ]

  if (vehicle.platformLengthM && vehicle.platformWidthM) {
    result.push({
      label: 'Հարթակի չափսեր',
      value: `${vehicle.platformLengthM} մ × ${vehicle.platformWidthM} մ`,
    })
  }

  result.push(
    { label: 'Ճախարակ (winch, лебедка)', value: vehicle.winch ? 'Այո' : 'Ոչ' },
    { label: 'Մանիպուլյատոր', value: vehicle.manipulator ? 'Այո' : 'Ոչ' },
  )

  if (vehicle.showPlateNumber && vehicle.plateNumber) {
    result.push({ label: 'Պետհամարանիշ', value: vehicle.plateNumber })
  }

  return result
})
</script>

<template>
  <section class="truck-info" aria-labelledby="truck-info-title">
    <h2 id="truck-info-title" class="truck-info__title">Մեքենայի տվյալներ</h2>
    <dl class="truck-info__list">
      <div v-for="row in rows" :key="row.label" class="truck-info__row">
        <dt>{{ row.label }}</dt>
        <dd>
          {{ row.value }}
          <AppTooltip v-if="row.hint" :label="`${row.value} — բացատրություն`">
            {{ row.hint }}
          </AppTooltip>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped lang="scss">
.truck-info {
  &__title {
    margin-bottom: var(--space-4);
  }

  &__list {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0;

    @media (min-width: 640px) {
      grid-template-columns: 1fr 1fr;
      column-gap: var(--space-6);
    }
  }

  &__row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-border);

    dt {
      color: var(--color-text-secondary);
    }

    dd {
      margin: 0;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-weight: 600;
      text-align: right;
    }
  }
}
</style>
