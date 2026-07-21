<script setup lang="ts">
import type { TowTruckPricing } from '~/types/towTruck'
import { formatPrice, formatPricePerKm } from '~/utils/formatPrice'

interface Props {
  pricing?: TowTruckPricing
}

const props = withDefaults(defineProps<Props>(), { pricing: undefined })

interface PricingRow {
  label: string
  value: string
}

/** Only the fields the driver actually filled in */
const rows = computed<PricingRow[]>(() => {
  const pricing = props.pricing
  if (!pricing) return []

  const result: PricingRow[] = []
  if (pricing.cityCallout !== undefined)
    result.push({ label: 'Քաղաքում կանչ', value: `սկսած ${formatPrice(pricing.cityCallout)}` })
  if (pricing.perKm !== undefined)
    result.push({ label: 'Միջքաղաքային տեղափոխում', value: formatPricePerKm(pricing.perKm) })
  if (pricing.waitingPerHour !== undefined)
    result.push({ label: 'Սպասում', value: `${formatPrice(pricing.waitingPerHour)}/ժամ` })
  if (pricing.nightSurchargePercent !== undefined)
    result.push({ label: 'Գիշերային ծառայություն', value: `+${pricing.nightSurchargePercent}%` })
  if (pricing.extraLoading !== undefined)
    result.push({ label: 'Բարդ բեռնում', value: `+${formatPrice(pricing.extraLoading)}` })
  return result
})
</script>

<template>
  <section v-if="rows.length > 0" class="truck-pricing" aria-labelledby="truck-pricing-title">
    <h2 id="truck-pricing-title" class="truck-pricing__title">Գներ</h2>
    <dl class="truck-pricing__list">
      <div v-for="row in rows" :key="row.label" class="truck-pricing__row">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
    <p class="truck-pricing__note">
      Վերջնական գինը կարող է կախված լինել մեքենայի տեսակից, վիճակից, հեռավորությունից և բեռնման
      բարդությունից։
    </p>
  </section>
</template>

<style scoped lang="scss">
.truck-pricing {
  &__title {
    margin-bottom: var(--space-4);
  }

  &__list {
    margin: 0;
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
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
    }
  }

  &__note {
    margin: var(--space-3) 0 0;
    font-size: 0.88rem;
    color: var(--color-text-muted);
  }
}
</style>
