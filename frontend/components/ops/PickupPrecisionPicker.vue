<script setup lang="ts">
/**
 * «How sure are you of this point?» (2026-11-17) — asked whenever pickup
 * coordinates are written: in the order form (create and edit) and in the
 * order page's «add coordinates» box. No default on purpose: a point marked
 * «exact» by accident would send the driver to a guess without telling him.
 * The driver sees the answer under «Նավիգացիա» and on the offer.
 */
import type { PickupPrecision } from '~/types/opsDispatch'
import { PICKUP_PRECISION_HINT, PICKUP_PRECISION_LABEL } from '~/utils/opsDispatchLabels'

const model = defineModel<PickupPrecision | ''>({ required: true })
defineProps<{ disabled?: boolean; invalid?: boolean; name: string }>()
const OPTIONS: PickupPrecision[] = ['EXACT', 'APPROXIMATE']
</script>

<template>
  <fieldset class="precision" :class="{ 'precision--invalid': invalid }" :disabled="disabled">
    <legend>Կետը ճշգրի՞տ է*</legend>
    <label v-for="option in OPTIONS" :key="option" class="precision__option" :class="{ on: model === option }">
      <input v-model="model" type="radio" :name="name" :value="option" />
      <span>
        <strong>{{ PICKUP_PRECISION_LABEL[option] }}</strong>
        <small>{{ PICKUP_PRECISION_HINT[option] }}</small>
      </span>
    </label>
    <small v-if="invalid" class="precision__error">Ընտրեք՝ կետը հաստատվա՞ծ է, թե մոտավոր</small>
  </fieldset>
</template>

<style scoped lang="scss">
.precision {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin: 0;
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));

  legend {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    padding: 0 4px;
  }
  &--invalid {
    border-color: var(--color-danger, #d64545);
  }
  &__option {
    display: flex !important;
    gap: 8px;
    align-items: flex-start;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    border: 1.5px solid var(--color-border);
    cursor: pointer;
    span {
      display: grid;
      gap: 2px;
    }
    strong {
      color: var(--color-text);
      font-size: 0.9rem;
    }
    small {
      font-size: 0.78rem;
      color: var(--color-text-secondary);
    }
    &.on {
      border-color: var(--color-primary, #14304f);
      background: var(--color-primary-bg, #e8eef6);
    }
  }
  &__error {
    grid-column: 1 / -1;
    color: var(--color-danger, #d64545);
    font-size: 0.8rem;
  }
}
</style>
