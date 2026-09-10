<script setup lang="ts">
import type { TowTruckVehicle } from '~/types/towTruck'
import { asksDoubleDeck, asksTowHitch, asksWheelSkates, hasManipulator } from '~/constants/vehicles'
import { formatPlatformDimensions } from '~/utils/platformDimensions'

interface Props {
  vehicle: TowTruckVehicle
}

const props = defineProps<Props>()

const { t, locale } = useI18n()
const { vehicleTypeLabel, vehicleTypeHint, capacityText } = useCatalogLabels()

/** «Այո» / «Ոչ» — the only two values half this table ever holds */
const yesNo = (value: boolean): string => (value ? t('truck.yes') : t('truck.no'))

interface InfoRow {
  label: string
  value: string
  hint?: string
}

const rows = computed<InfoRow[]>(() => {
  const { vehicle } = props
  const result: InfoRow[] = [
    { label: t('truck.brand'), value: vehicle.brand },
    { label: t('truck.model'), value: vehicle.model },
    { label: t('truck.year'), value: String(vehicle.year) },
    {
      label: t('truck.type'),
      value: vehicleTypeLabel(vehicle.type),
      hint: vehicleTypeHint(vehicle.type),
    },
  ]

  // The capacity, stated the way the driver stated it.
  //
  // `capacityDisplayText` renders «մինչև X տ» from the BAND a driver picked,
  // which is the honest summary for an ordinary evacuator and a misleading one
  // for a specialist: a machinery transporter gave a real figure
  // (`maxLoadTons`), and rounding it into «10 տոննայից ավելի» throws away the
  // one number the whole booking turns on. See `usesExactCapacity`.
  result.push(
    vehicle.maxLoadTons === undefined
      ? { label: t('truck.capacity'), value: capacityText(vehicle.capacityTons) }
      : {
          label: t('truck.maxLoad'),
          value: `${vehicle.maxLoadTons} ${t('units.ton')}`,
        },
  )

  // The specialist figures, each omitted entirely when unanswered.
  //
  // A missing spec is rendered as no row rather than as «0 տ» or «—»: the
  // customer reads a specification table as a list of facts, and an invented
  // zero is a worse answer than an absent one. Same rule the prices follow.
  const specs: { label: string; value?: number; unit: string }[] = [
    {
      label: t('truck.craneCapacity'),
      value: vehicle.craneCapacityTons,
      unit: t('units.ton'),
    },
    { label: t('truck.craneReach'), value: vehicle.craneReachM, unit: t('units.metre') },
    {
      label: t('truck.platformLoadHeight'),
      value: vehicle.platformLoadHeightCm,
      unit: t('units.centimetre'),
    },
  ]
  for (const spec of specs) {
    if (spec.value !== undefined) {
      result.push({ label: spec.label, value: `${spec.value} ${spec.unit}` })
    }
  }

  const platformSize = formatPlatformDimensions(
    vehicle.platformLengthM,
    vehicle.platformWidthM,
    locale.value,
  )
  if (platformSize) {
    result.push({ label: t('truck.platformSize'), value: platformSize })
  }

  result.push(
    { label: t('truck.winch'), value: yesNo(vehicle.winch) },
    // The same predicate the filter uses, deliberately. Reading the raw boolean
    // here is what let a truck be returned by «Մանիպուլյատոր» and then say
    // «Ոչ» on its own page — one contradiction, two sources.
    { label: t('truck.manipulator'), value: yesNo(hasManipulator(vehicle)) },
  )

  // Omitted for the vehicles that are never asked about skates — see
  // `asksWheelSkates`. Rendering «Անիվային ռոլիկներ՝ Ոչ» for a manipulator
  // states an absence nobody claimed, about equipment the job has no use for,
  // and reads as a shortcoming rather than as an irrelevance.
  if (asksWheelSkates(vehicle.type)) {
    result.push({
      label: t('truck.wheelSkates'),
      value: yesNo(vehicle.wheelSkates),
      hint: t('truck.wheelSkatesHint'),
    })
  }

  // Omitted for the same two vehicles, and for the same reason — see
  // `asksDoubleDeck`. A plain boolean read, not a union predicate like
  // `hasManipulator`: no vehicle type implies a second deck, so there is no
  // second answer this could contradict.
  if (asksDoubleDeck(vehicle.type)) {
    result.push({
      label: t('truck.doubleDeck'),
      value: yesNo(vehicle.doubleDeck),
      hint: t('truck.doubleDeckHint'),
    })
  }

  // Own predicate, not `asksDoubleDeck` — see `asksTowHitch`.
  if (asksTowHitch(vehicle.type)) {
    result.push({
      label: t('truck.towHitch'),
      value: yesNo(vehicle.towHitch),
      hint: t('truck.towHitchHint'),
    })
  }

  if (vehicle.showPlateNumber && vehicle.plateNumber) {
    result.push({ label: t('truck.plateNumber'), value: vehicle.plateNumber })
  }

  return result
})
</script>

<template>
  <section class="truck-info" aria-labelledby="truck-info-title">
    <h2 id="truck-info-title" class="truck-info__title">{{ t('truck.infoTitle') }}</h2>
    <dl class="truck-info__list">
      <div v-for="row in rows" :key="row.label" class="truck-info__row">
        <dt>{{ row.label }}</dt>
        <dd>
          {{ row.value }}
          <AppTooltip v-if="row.hint" :label="t('truck.explain', { value: row.value })">
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
